'use strict'; // eslint-disable-line strict

const Stats = require('arsenal').metrics.StatsClient;

// TODO: Instead of extending, reflect these changes in arsenal

class StatsClient extends Stats {
    /**
    * report/record a new request received on the server
    * @param {string} id - service identifier
    * @param {callback} cb - callback
    * @param {number} amount - amount to increment by (default = 1)
    * @return {undefined}
    */
    reportNewRequest(id, cb, amount = 1) {
        if (!this._redis) {
            return undefined;
        }
        const callback = cb || this._noop;
        const key = this._buildKey(`${id}:requests`, new Date());

        if (amount > 1) {
            return this._redis.incrbyEx(key, amount, this._expiry, callback);
        }
        return this._redis.incrEx(key, this._expiry, callback);
    }
}

module.exports = StatsClient;
