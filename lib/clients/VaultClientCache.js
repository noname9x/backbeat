const fs = require('fs');

const VaultClient = require('vaultclient').Client;

/**
 * @class VaultClientCache
 *
 * @classdesc Helper class to manage a set of Vault clients
 *
 * Clients share the same configuration based on the profile they
 * belong to. A profile is automatically created when it does not
 * exist and the first configuration is set for a given profile name.
 *
 * When getClient() is called, a new or cached Vaultclient instance is
 * returned, based on if the profile name, host and port provided
 * match a cached instance. When VaultClient instances are created
 * they are cached and kept indefinitely.
 */
class VaultClientCache {
    constructor() {
        this._profiles = {};
        this._vaultClients = {};
    }

    _updateProfile(profileName, params) {
        const profile = this._profiles[profileName] || {};
        this._profiles[profileName] = profile;

        Object.assign(profile, params);
        return this;
    }

    /**
     * Load Vault administrative credentials from a file, bind them to
     * the profile given by profileName. Those credentials will be
     * configured in further created clients under the same profile
     * name.
     *
     * The function throws an error if the file is not readable or has
     * invalid format.
     *
     * @param {string} profileName - name of profile to bind the
     *   credentials to
     * @param {string} filePath - path to credentials file. This file
     *   must be a JSON file in the following format:
     *   {"accessKey":"secretKey"}
     * @return {VaultClientCache} this
     */
    loadAdminCredentialsFromFile(profileName, filePath) {
        const adminCredsJSON = fs.readFileSync(filePath);
        const adminCredsObj = JSON.parse(adminCredsJSON);
        const accessKey = Object.keys(adminCredsObj)[0];
        const secretKey = adminCredsObj[accessKey];

        return this._updateProfile(profileName, {
            adminCreds: { accessKey, secretKey },
        });
    }

    /**
     * Set the target Vault host name for the given profile
     *
     * @param {string} profileName - name of profile to bind the host
     *   name to
     * @param {string} host - target Vault host
     * @return {VaultClientCache} this
     */
    setHost(profileName, host) {
        return this._updateProfile(profileName, { host });
    }

    /**
     * Set the target Vault port for the given profile
     *
     * @param {string} profileName - name of profile to bind the port to
     * @param {number} port - target Vault port
     * @return {VaultClientCache} this
     */
    setPort(profileName, port) {
        return this._updateProfile(profileName, { port });
    }

    /**
     * Set the proxy path to prepend to the URL when requesting the
     * target Vault for the given profile
     *
     * @param {string} profileName - name of profile to bind the proxy
     *   path to
     * @param {string} proxyPath - proxy path
     * @return {VaultClientCache} this
     */
    setProxyPath(profileName, proxyPath) {
        return this._updateProfile(profileName, { proxyPath });
    }

    /**
     * Get a VaultClient instance
     *
     * @param {string} profileName - name of profile used as part of
     *   the cache key to match a VaultClient instance
     * @param {string} [host] - host name for the target Vault,
     *   ignored if setHost() has been called with the same profile name
     * @param {number} [port] - port number for the target Vault,
     *   ignored if setPort() has been called with the same profile name
     *
     * @return {VaultClient|null} a new or cached VaultClient instance
     *   matching the given profile name and host/port (when
     *   provided), or null if host or port are missing in this call
     *   and in the profile (set through setHost()/setPort())
     */
    getClient(profileName, host, port) {
        const profile = this._profiles[profileName] || {};
        const vaultHost = profile.host || host;
        const vaultPort = profile.port || port;
        if (!vaultHost || !vaultPort) {
            return null;
        }
        const key = `${profileName}:${vaultHost}:${vaultPort}`;

        if (this._vaultClients[key] === undefined) {
            this._vaultClients[key] = new VaultClient(
                vaultHost, vaultPort,
                undefined, undefined, undefined, undefined, undefined,
                profile.adminCreds && profile.adminCreds.accessKey,
                profile.adminCreds && profile.adminCreds.secretKey,
                undefined,
                profile.proxyPath);
        }
        return this._vaultClients[key];
    }
}

module.exports = VaultClientCache;
