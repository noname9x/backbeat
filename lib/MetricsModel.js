'use strict'; // eslint-disable-line strict

class MetricsModel {
    /**
     * Create a metrics object
     * @param {string} op - operation indicator (add, sub)
     * @param {number} dataBytes - data size in bytes
     * @param {number} mdBytes - metadata size in bytes
     * @param {string} bucket - bucket
     * @param {string} ext - extension
     * @param {string} type - verb type, i.e. put, delete
     * @return {object} metrics data object
     * @static
     */
    static serialize(op, dataBytes, mdBytes, bucket, ext, type) {
        return (
            {
                timestamp: Date.now(),
                op,
                dataBytes,
                mdBytes,
                bucket,
                ext,
                type,
            }
        );
    }
}

module.exports = MetricsModel;
