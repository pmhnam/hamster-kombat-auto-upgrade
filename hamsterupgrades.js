const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');

const csvDataAuth = fs.readFileSync('authorization.csv', 'utf8');
const authorizationList = csvDataAuth.split('\n').map(line => line.trim()).filter(line => line !== '');
const csvDataProxy = fs.readFileSync('proxy.csv', 'utf8');
const proxyList = csvDataProxy.split('\n').map(line => line.trim()).filter(line => line !== '');

// Update here if you want to use proxy
const USE_PROXY = false;
const MAX_AMOUNT = 1000000;

let Reset = "\x1b[0m%s";
let FgRed = "\x1b[31m%s\x1b[0m";
let FgGreen = "\x1b[32m%s\x1b[0m";
let FgYellow = "\x1b[33m%s\x1b[0m";
let FgBlue = "\x1b[34m%s\x1b[0m";
let FgMagenta = "\x1b[35m%s\x1b[0m";


function createAxiosInstance(proxy) {
    const proxyAgent = USE_PROXY ? new HttpsProxyAgent(proxy) : null;
    return axios.create({
        baseURL: 'https://api.hamsterkombat.io',
        timeout: 60 * 1000,
        headers: {
            'Content-Type': 'application/json'
        },
        ...(USE_PROXY && { httpsAgent: proxyAgent })
    });
}

async function checkProxyIP(proxy) {
    try {
        if (!USE_PROXY) {
            console.log(FgBlue, 'Dont use proxy');
            return true;
        };
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: proxyAgent
        });
        if (response.status === 200) {
            console.log(FgBlue, 'Địa chỉ IP của proxy là:', response.data.ip);
        } else {
            console.error(FgGreen, 'Không thể kiểm tra IP của proxy. Status code:', response.status);
        }
    } catch (error) {
        console.error(FgRed, 'Error khi kiểm tra IP của proxy:', error);
    }
}

async function sleep(ms) {
    const time = ms || Math.random() * 1000; // Random time sleep between 0 - 1s
    console.log(FgBlue, `Sleep ${time} ms...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBalanceCoins(axiosInstance, authorization) {
    try {
        const response = await axiosInstance.post('/clicker/sync', {}, {
            headers: {
                'Authorization': `Bearer ${authorization}`
            }
        });

        if (response.status === 200) {
            return response.data.clickerUser.balanceCoins;
        } else {
            console.error(FgRed, `Get balance coins failed. Status code:`, response.status);
            return null;
        }
    } catch (error) {
        console.error(FgRed, 'Error:', error);
        return null;
    }
}

async function buyUpgrades(axiosInstance, authorization) {
    try {
        const upgradesResponse = await axiosInstance.post('/clicker/upgrades-for-buy', {}, {
            headers: {
                'Authorization': `Bearer ${authorization}`
            }
        });

        if (upgradesResponse.status === 200) {
            const upgrades = upgradesResponse.data.upgradesForBuy;
            let balanceCoins = await getBalanceCoins(axiosInstance, authorization);
            let purchased = false;

            for (const upgrade of upgrades) {
                if (upgrade.cooldownSeconds > 0) {
                    console.log(FgYellow, `Card ${upgrade.name} in cool down for ${upgrade.cooldownSeconds} seconds.`);
                    continue;
                }

                if (upgrade.isAvailable && !upgrade.isExpired && upgrade.price < MAX_AMOUNT && upgrade.price <= balanceCoins) {
                    const buyUpgradePayload = {
                        upgradeId: upgrade.id,
                        timestamp: Date.now() / 1000
                    };
                    try {
                        await sleep(1000);
                        const response = await axiosInstance.post('/clicker/buy-upgrade', buyUpgradePayload, {
                            headers: {
                                'Authorization': `Bearer ${authorization}`
                            }
                        });
                        if (response.status === 200) {
                            console.log(FgGreen, `(${Math.floor(balanceCoins)}) upgraded '${upgrade.name}' successfully.\n`);
                            purchased = true;
                            balanceCoins -= upgrade.price;
                        }
                    } catch (error) {
                        if (error.response && error.response.data && error.response.data.error_code === 'UPGRADE_COOLDOWN') {
                            console.log(FgRed, `Card ${upgrade.name} in cool down for ${error.response.data.cooldownSeconds} seconds.`);
                            continue;
                        } else {
                            throw error;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (!purchased) {
                console.log(FgMagenta, `Token ${authorization.substring(0, 10)}... does not have available cards to upgrade. Try again...`);
                return false;
            }
        } else {
            console.error(FgRed, 'Can not get cards . Status code:', upgradesResponse.status);
            return false;
        }
    } catch (error) {
        console.error(FgRed, 'Error:', error);
        return false;
    }
    return true;
}

async function claimDailyCipher(axiosInstance, authorization, cipher) {
    if (cipher) {
        try {
            const payload = {
                cipher: cipher
            };
            const response = await axiosInstance.post('/clicker/claim-daily-cipher', payload, {
                headers: {
                    'Authorization': `Bearer ${authorization}`
                }
            });

            if (response.status === 200) {
                console.log(FgGreen, `Claimed '${cipher}' successfully.`);
            } else {
                console.error(FgRed, 'Can not claim cipher. Status code:', response.status);
            }
        } catch (error) {
            console.error(FgRed, 'Morse code was invalid. Error:', error.toJSON().message);
        }
    }
}

async function runForAuthorization(authorization, proxy, cipher) {
    const axios = createAxiosInstance();
    await checkProxyIP(proxy);
    await claimDailyCipher(axios, authorization, cipher);
    while (true) {
        const success = await buyUpgrades(axios, authorization);
        if (!success) {
            break;
        }
    }
}

async function askForCipher() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question('Enter cipher: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function main() {
    const cipher = await askForCipher();
    while (true) {
        for (let i = 0; i < authorizationList.length; i++) {
            const authorization = authorizationList[i];
            const proxy = USE_PROXY ? proxyList[i % proxyList.length] : null;
            await runForAuthorization(authorization, proxy, cipher);
        }
        console.log(FgBlue, 'Sleep 10 minutes...');
        await new Promise(resolve => setTimeout(resolve, 1000 * 60 * 10));
    }
}

main();
