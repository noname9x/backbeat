module.exports = {
    name: 'replication',
    version: '1.0.0',
    configValidator: require('./ReplicationConfigValidator'),
    queuePopulatorExtension: require('./ReplicationQueuePopulator'),
};
