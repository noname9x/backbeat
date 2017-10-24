'use strict'; // eslint-disable-line strict

const Redis = require('arsenal').metrics.RedisClient;

// NOTE: This should eventually be moved to Arsenal.
// For now, attempting to implement locally.

class RedisClient extends Redis {
    /**
     * The extended constructor takes the following params
     * @param {Object} config - config
     * @param {string} config.host - Redis host
     * @param {number} config.port - Redis port
     * @param {string} config.password - Redis password
     * @param {werelogs.Logger} logger - logger instance
     */
    constructor(config, logger) {
        super(config, logger);

        return this;
    }

     /**
      * increment value of a key by a given amount and set a ttl
      * @param {string} key - key holding the value
      * @param {number} amount - amount to increase by
      * @param {number} expiry - expiry in seconds
      * @param {callback} cb - callback
      * @return {undefined}
      */
    incrbyEx(key, amount, expiry, cb) {
        return this._client
            .multi([['incrby', key, amount], ['expire', key, expiry]])
            .exec(cb);
    }
}

module.exports = RedisClient;
