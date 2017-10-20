const { isMasterKey } = require('arsenal/lib/versioning/Version');

const QueuePopulatorExtension =
          require('../../lib/queuePopulator/QueuePopulatorExtension');
const MetricsModel = require('../../lib/MetricsModel');

class ReplicationQueuePopulator extends QueuePopulatorExtension {
    constructor(params) {
        super(params);
        this.repConfig = params.extConfig;
        this.mConfig = params.mConfig;
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

        this.publish(this.repConfig.topic,
                     `${entry.bucket}/${entry.key}`,
                     JSON.stringify(entry));

        // TODO: data I'm not sure about
        // how to determine metadata bytes?
        // how to calculate bytes?
        // https://github.com/miktam/sizeof
        const dataBytes = 100;
        const mdBytes = 100;

        const metricsEntry = MetricsModel.serialize('add', dataBytes, mdBytes,
            entry.bucket, this.name, entry.type);

        this.publish(this.mConfig.topic,
                     `${entry.bucket}-metric`,
                     JSON.stringify(metricsEntry));
    }
}

module.exports = ReplicationQueuePopulator;
