'use strict'; // eslint-disable-line

const http = require('http');

const Logger = require('werelogs').Logger;

const errors = require('arsenal').errors;
const RoundRobin = require('arsenal').network.RoundRobin;
const VaultClient = require('vaultclient').Client;

const BackbeatConsumer = require('../../../lib/BackbeatConsumer');
const QueueEntry = require('../../../lib/models/QueueEntry');
const ReplicationTaskScheduler = require('./ReplicationTaskScheduler');
const QueueProcessorTask = require('./QueueProcessorTask');
const MultipleBackendTask = require('./MultipleBackendTask');

const { metricsExtension, metricsTypeProcessed } = require('../constants');

/**
* Given that the largest object JSON from S3 is about 1.6 MB and adding some
* padding to it, Backbeat replication topic is currently setup with a config
* max.message.bytes.limit to 5MB. Consumers need to update their fetchMaxBytes
* to get atleast 5MB put in the Kafka topic, adding a little extra bytes of
* padding for approximation.
*/
const CONSUMER_FETCH_MAX_BYTES = 5000020;

class QueueProcessor {

    /**
     * Create a queue processor object to activate Cross-Region
     * Replication from a kafka topic dedicated to store replication
     * entries to a target S3 endpoint.
     *
     * @constructor
     * @param {Object} zkConfig - zookeeper configuration object
     * @param {String} zkConfig.connectionString - zookeeper connection string
     *   as "host:port[/chroot]"
     * @param {Object} sourceConfig - source S3 configuration
     * @param {Object} sourceConfig.s3 - s3 endpoint configuration object
     * @param {Object} sourceConfig.auth - authentication info on source
     * @param {Object} destConfig - target S3 configuration
     * @param {Object} destConfig.auth - authentication info on target
     * @param {Object} repConfig - replication configuration object
     * @param {String} repConfig.topic - replication topic name
     * @param {String} repConfig.queueProcessor - config object
     *   specific to queue processor
     * @param {String} repConfig.queueProcessor.groupId - kafka
     *   consumer group ID
     * @param {String} repConfig.queueProcessor.retryTimeoutS -
     *   number of seconds before giving up retries of an entry
     *   replication
     * @param {MetricsProducer} mProducer - instance of metrics producer
     */
    constructor(zkConfig, sourceConfig, destConfig, repConfig, mProducer) {
        this.zkConfig = zkConfig;
        this.sourceConfig = sourceConfig;
        this.destConfig = destConfig;
        this.repConfig = repConfig;
        this._mProducer = mProducer;
        this.destHosts = null;

        this.logger = new Logger('Backbeat:Replication:QueueProcessor');

        // global variables
        // TODO: for SSL support, create HTTPS agents instead
        this.sourceHTTPAgent = new http.Agent({ keepAlive: true });
        this.destHTTPAgent = new http.Agent({ keepAlive: true });

        // FIXME support multiple cloud-server destination sites
        if (Array.isArray(destConfig.bootstrapList)) {
            destConfig.bootstrapList.forEach(dest => {
                if (Array.isArray(dest.servers)) {
                    this.destHosts =
                        new RoundRobin(dest.servers, { defaultPort: 80 });
                }
            });
        }

        if (sourceConfig.auth.type === 'role') {
            const { host, port } = sourceConfig.auth.vault;
            this.sourceVault = new VaultClient(host, port);
        }
        if (destConfig.auth.type === 'role') {
            // vault client cache per destination
            this.destVaults = {};
        }

        this.taskScheduler = new ReplicationTaskScheduler(
            (ctx, done) => ctx.task.processQueueEntry(ctx.entry, done));
    }

    getStateVars() {
        return {
            sourceConfig: this.sourceConfig,
            destConfig: this.destConfig,
            repConfig: this.repConfig,
            destHosts: this.destHosts,
            sourceHTTPAgent: this.sourceHTTPAgent,
            destHTTPAgent: this.destHTTPAgent,
            sourceVault: this.sourceVault,
            destVaults: this.destVaults,
            logger: this.logger,
        };
    }

    start() {
        const consumer = new BackbeatConsumer({
            zookeeper: { connectionString: this.zkConfig.connectionString },
            topic: this.repConfig.topic,
            groupId: this.repConfig.queueProcessor.groupId,
            concurrency: this.repConfig.queueProcessor.concurrency,
            queueProcessor: this.processKafkaEntry.bind(this),
            fetchMaxBytes: CONSUMER_FETCH_MAX_BYTES,
        });
        consumer.on('error', () => {});
        consumer.subscribe();

        consumer.on('metrics', data => {
            // i.e. data = { my-bucket: { ops: 1, bytes: 124 } }
            this._mProducer.publishMetrics(data, metricsTypeProcessed,
                metricsExtension, err => {
                    this.logger.trace('error occurred in publishing metrics', {
                        error: err,
                        method: 'QueueProcessor.start',
                    });
                });
        });

        this.logger.info('queue processor is ready to consume ' +
                         'replication entries');
    }

    /**
     * Proceed to the replication of an object given a kafka
     * replication queue entry
     *
     * @param {object} kafkaEntry - entry generated by the queue populator
     * @param {string} kafkaEntry.key - kafka entry key
     * @param {string} kafkaEntry.value - kafka entry value
     * @param {function} done - callback function
     * @return {undefined}
     */
    processKafkaEntry(kafkaEntry, done) {
        const sourceEntry = QueueEntry.createFromKafkaEntry(kafkaEntry);
        if (sourceEntry.error) {
            this.logger.error('error processing source entry',
                              { error: sourceEntry.error });
            return process.nextTick(() => done(errors.InternalError));
        }
        const multipleBackends = ['aws_s3', 'azure'];
        const storageType = sourceEntry.getReplicationStorageType();
        return this.taskScheduler.push({
            task: multipleBackends.includes(storageType) ?
                new MultipleBackendTask(this) : new QueueProcessorTask(this),
            entry: sourceEntry,
        },
        `${sourceEntry.getBucket()}/${sourceEntry.getObjectKey()}`,
        done);
    }
}

module.exports = QueueProcessor;
