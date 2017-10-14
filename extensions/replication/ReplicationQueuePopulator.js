const { isMasterKey } = require('arsenal/lib/versioning/Version');

const QueuePopulatorExtension =
          require('../../lib/queuePopulator/QueuePopulatorExtension');
const QueueEntry = require('../../lib/models/QueueEntry');

class ReplicationQueuePopulator extends QueuePopulatorExtension {
    constructor(params) {
        super(params);
        this.repConfig = params.extConfig;
    }

    filter(entry) {
        if (entry.type !== 'put' || isMasterKey(entry.key)) {
            return;
        }
        const value = JSON.parse(entry.value);
        const queueEntry = new QueueEntry(entry.bucket, entry.key, value);
        const sanityCheckRes = queueEntry.checkSanity();
        if (sanityCheckRes) {
            return;
        }
        if (queueEntry.getReplicationStatus() !== 'PENDING') {
            return;
        }

        this.publish(this.repConfig.topic,
                     `${queueEntry.getBucket()}/${queueEntry.getObjectKey()}`,
                     JSON.stringify(entry));

        if (queueEntry.getReducedLocations) {
            const locations = queueEntry.getReducedLocations();
            const bytes = locations.reduce((sum, item) => sum + item.size, 0);

            this._incrementMetrics(entry.bucket, bytes);
        } else {
            this.log.error('queue entry has no functions getReducedLocations', {
                method: 'ReplicationQueuePopulator.filter',
                key: entry.key,
                bucket: entry.bucket,
            });
        }
    }
}

module.exports = ReplicationQueuePopulator;
