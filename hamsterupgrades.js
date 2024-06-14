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
            console.log('Dont use proxy');
            return true;
        };
        const proxyAgent = new HttpsProxyAgent(proxy);
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: proxyAgent
        });
        if (response.status === 200) {
            console.log('Địa chỉ IP của proxy là:', response.data.ip);
        } else {
            console.error('Không thể kiểm tra IP của proxy. Status code:', response.status);
        }
    } catch (error) {
        console.error('Error khi kiểm tra IP của proxy:', error);
    }
}

async function sleep(ms) {
    const time = ms || Math.random() * 1000; // Random time sleep between 0 - 1s
    console.log('Sleep', time, 'ms...');
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
            console.error(`Get balance coins failed. Status code:`, response.status);
            return null;
        }
    } catch (error) {
        console.error('Error:', error);
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
                    console.log(`Card ${upgrade.name} in cool down for ${upgrade.cooldownSeconds} seconds.`);
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
                            console.log(`(${Math.floor(balanceCoins)}) upgraded '${upgrade.name}' successfully.\n`);
                            purchased = true;
                            balanceCoins -= upgrade.price;
                        }
                    } catch (error) {
                        if (error.response && error.response.data && error.response.data.error_code === 'UPGRADE_COOLDOWN') {
                            console.log(`Card ${upgrade.name} in cool down for ${error.response.data.cooldownSeconds} seconds.`);
                            continue;
                        } else {
                            throw error;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (!purchased) {
                console.log(`Token ${authorization.substring(0, 10)}... does not have available cards to upgrade. Try again...`);
                return false;
            }
        } else {
            console.error('Can not get cards . Status code:', upgradesResponse.status);
            return false;
        }
    } catch (error) {
        console.error('Error:', error);
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
                console.log(`Claimed '${cipher}' successfully.`);
            } else {
                console.error('Can not claim cipher. Status code:', response.status);
            }
        } catch (error) {
            console.error('Morse code was invalid. Error:', error);
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
        console.log('Sleep 10 minutes...');
        await new Promise(resolve => setTimeout(resolve, 1000 * 60 * 10));
    }
}

main();






// fetch("https://api.hamsterkombat.io/clicker/upgrades-for-buy", {
//     "headers": {
//         "accept": "*/*",
//         "accept-language": "vi,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
//         "authorization": "Bearer 1717860303477QYWihTFFSkNnsHqVsXJeXt0BIyvobzbkGcxksz57golz8WY2Ezb2KqFTbnM0Bcgr5467596172",
//         "sec-ch-ua": "\"Microsoft Edge\";v=\"125\", \"Chromium\";v=\"125\", \"Not.A/Brand\";v=\"24\"",
//         "sec-ch-ua-mobile": "?0",
//         "sec-ch-ua-platform": "\"Windows\"",
//         "sec-fetch-dest": "empty",
//         "sec-fetch-mode": "cors",
//         "sec-fetch-site": "same-site",
//         "sec-gpc": "1",
//         "Referer": "https://hamsterkombat.io/",
//         "Referrer-Policy": "strict-origin-when-cross-origin"
//     },
//     "body": null,
//     "method": "POST"
// });




// fetch("https://api.hamsterkombat.io/clicker/buy-upgrade", {
//     "headers": {
//         "accept": "application/json",
//         "accept-language": "vi,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
//         "authorization": "Bearer 1717860303477QYWihTFFSkNnsHqVsXJeXt0BIyvobzbkGcxksz57golz8WY2Ezb2KqFTbnM0Bcgr5467596172",
//         "content-type": "application/json",
//         "sec-ch-ua": "\"Microsoft Edge\";v=\"125\", \"Chromium\";v=\"125\", \"Not.A/Brand\";v=\"24\"",
//         "sec-ch-ua-mobile": "?0",
//         "sec-ch-ua-platform": "\"Windows\"",
//         "sec-fetch-dest": "empty",
//         "sec-fetch-mode": "cors",
//         "sec-fetch-site": "same-site",
//         "sec-gpc": "1",
//         "Referer": "https://hamsterkombat.io/",
//         "Referrer-Policy": "strict-origin-when-cross-origin"
//     },
//     "body": "{\"upgradeId\":\"gamefi_tokens\",\"timestamp\":1718368570410}",
//     "method": "POST"
// });