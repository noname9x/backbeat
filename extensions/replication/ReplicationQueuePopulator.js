const { isMasterKey } = require('arsenal/lib/versioning/Version');

const QueuePopulatorExtension =
          require('../../lib/queuePopulator/QueuePopulatorExtension');
const MetricsModel = require('../../lib/MetricsModel');

class ReplicationQueuePopulator extends QueuePopulatorExtension {
    constructor(params) {
        super(params);
        this.repConfig = params.extConfig;
        this.mConfig = params.mConfig;

        // metrics
        this._opCount = 0;
        this._bytesCount = 0;
    }

    filter(entry) {
        if (entry.type !== 'put' || isMasterKey(entry.key)) {
            return;
        }
        const value = JSON.parse(entry.value);
        if (!value.replicationInfo ||
            value.replicationInfo.status !== 'PENDING') {
            return;
        }

        const entryBytes = value.location.reduce((sum, item) =>
            sum + item.size, 0);
        this._bytesCount += entryBytes;
        this._opCount++;

        this.publish(this.repConfig.topic,
                     `${entry.bucket}/${entry.key}`,
                     JSON.stringify(entry));

        const metricsEntry = MetricsModel.serialize('queued', entryBytes,
            entry.bucket, this.name);

        this.publish(this.mConfig.topic,
                     `${entry.bucket}-metric`,
                     JSON.stringify(metricsEntry));
    }
}

module.exports = ReplicationQueuePopulator;
