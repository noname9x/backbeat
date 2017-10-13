'use strict'; // eslint-disable-line

const joi = require('joi');
const { hostPortJoi, logJoi } = require('../lib/config/configItems.joi.js');

const joiSchema = {
    zookeeper: {
        connectionString: joi.string().required(),
        autoCreateNamespace: joi.boolean().default(false),
    },
    kafka: {
        hosts: joi.string().required(),
    },
    queuePopulator: {
        cronRule: joi.string().required(),
        batchMaxRead: joi.number().default(10000),
        zookeeperPath: joi.string().required(),
        logSource: joi.alternatives().try('bucketd', 'dmd').required(),
        bucketd: hostPortJoi,
        dmd: hostPortJoi.keys({
            logName: joi.string().default('s3-recordlog'),
        }),
    },
    log: logJoi,
    extensions: joi.object(),
};

module.exports = joiSchema;
