'use strict'; // eslint-disable-line

const constants = {
    zookeeperReplicationNamespace: '/backbeat/replication',
    proxyPath: '/_/backbeat/vault',
    proxyIAMPath: '/_/backbeat/iam',
    metricsExtension: 'crr',
    metricsTypeQueued: 'queued',
    metricsTypeProcessed: 'processed',
};

module.exports = constants;
