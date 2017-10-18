'use strict'; // eslint-disable-line strict

class MetricsModel {
    constructor(op, bucket, mdLen, dataLen, extension, type) {
        this._timestamp = Date.now();
        this._op = op;
        this._dataBytes = dataLen;
        this._mdBytes = mdLen;
        this._bucket = bucket;
        this._ext = extension;
        this._type = type;
    }

    serialize() {
        return (
            {
                timestamp: this._timestamp,
                op: this._op,
                dataBytes: this._dataBytes,
                mdBytes: this._mdBytes,
                bucket: this._bucket,
                ext: this._ext,
                type: this._type,
            }
        );
    }
}

module.exports = MetricsModel;
