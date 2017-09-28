const fs = require('fs');
const joi = require('joi');
const { hostPortJoi, bootstrapListJoi } =
    require('../../lib/config/configItems.joi.js');

const transportJoi = joi.alternatives().try('http', 'https')
    .default('http');

const authJoi = joi.object({
    type: joi.alternatives().try('account', 'role').required(),
    account: joi.string(),
    vault: hostPortJoi.keys({
        adminPort: joi.number().greater(0).optional(),
    }),
});

const joiSchema = {
    source: {
        transport: transportJoi,
        s3: hostPortJoi.required(),
        auth: authJoi.required(),
    },
    destination: {
        transport: transportJoi,
        auth: authJoi.required(),
        bootstrapList: bootstrapListJoi,
        certFilePaths: joi.object({
            key: joi.string().required(),
            cert: joi.string().required(),
            ca: joi.string().empty(''),
        }).required(),
    },
    topic: joi.string().required(),
    queueProcessor: {
        groupId: joi.string().required(),
        retryTimeoutS: joi.number().default(300),
        // versioning can support out of order updates
        concurrency: joi.number().greater(0).default(10),
    },
};

function configValidator(backbeatConfig, extConfig) {
    const validatedConfig = joi.attempt(extConfig, joiSchema);

    // additional target certs checks
    const { certFilePaths } = validatedConfig.destination;
    const { key, cert, ca } = certFilePaths;

    const makePath = value =>
              (value.startsWith('/') ?
               value : `${backbeatConfig.getBasePath()}/${value}`);
    const keypath = makePath(key);
    const certpath = makePath(cert);
    let capath = undefined;
    fs.accessSync(keypath, fs.F_OK | fs.R_OK);
    fs.accessSync(certpath, fs.F_OK | fs.R_OK);
    if (ca) {
        capath = makePath(ca);
        fs.accessSync(capath, fs.F_OK | fs.R_OK);
    }

    validatedConfig.destination.https = {
        cert: fs.readFileSync(certpath, 'ascii'),
        key: fs.readFileSync(keypath, 'ascii'),
        ca: ca ? fs.readFileSync(capath, 'ascii') : undefined,
    };
    return validatedConfig;
}

module.exports = configValidator;
