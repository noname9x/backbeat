'use strict'; // eslint-disable-line strict

// NOTE: key - objectVersionedKey??

class MetricsModel {
    /**
     * Create a metrics object
     * @param {string} op - operation indicator (queued or processed)
     * @param {number} dataBytes - data size in bytes
     * @param {string} bucket - bucket
     * @param {string} ext - extension
     * @param {string} type - verb type, i.e. put, delete
     * @return {object} metrics data object
     * @static
     */
    static serialize(op, dataBytes, bucket, ext) {
        // Removed: mdBytes
        return (
            {
                timestamp: Date.now(),
                op,
                dataBytes,
                bucket,
                ext,
                type: 'metrics',
            }
        );
    }
}

module.exports = MetricsModel;
