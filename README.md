# Overview
Server part of the Sora Farm project, which is responsible for calculating the number of PSWAP tokens earned by a user.

# System requirements
Node.js v14.8.0
MongoDB
![Application diagram](https://user-images.githubusercontent.com/16295803/94483384-73fb8700-01e3-11eb-89c9-8c7fa9d67388.png)

# Build, test & run
`yarn` To install all project dependencies\
`yarn build` Compiles an application\
`yarn start` Runs production version\
`yarn start:dev` Runs development version


# Integration
Application depends on database (MongoDB). 

# Configuration parameters
`APP_ETHEREUM` - url to connect with Ethereum node (ex. `"https://mainnet.infura.io/v3/<TOKEN>"`).

`APP_ETHEREUM_START_BLOCK` is the first block for starting calculations (ex. `"10843100"`).

`APP_DATABASE` - url to connect to database. Read more about [connection string](https://docs.mongodb.com/manual/reference/connection-string/)

`APP_HOST` - address at which to start the application (ex. `"0.0.0.0"`).

`APP_PORT` - port on which to run the application (ex. `8080`).

# Endpoints
## Get reward by address
It is used to count and get the number of PSWAP tokens calculated for a certain address. Returns JSON object containing reward for each pool of each exchanger
### Request
`GET /api/reward/<ETHEREUM_ADDRESS>`
```bash
curl -i -H 'Accept: application/json' http://localhost:8080/api/reward/0x0000000000000000000000000000000000000000
```
### Response
```json
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: *
Content-Type: application/json; charset=utf-8
Content-Length: 525
ETag: W/"20d-3D6BSQVOdNODZuowJyn4O+JURkk"
Date: Mon, 10 Oct 2020 13:37:00 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{
  "timestamp": 1607002375317,
  "user": {
    "reward": "0",
    "lastBlock": 10000000,
    "_id": "5f76429f309bac0cc7eb026c",
    "address": "0x0000000000000000000000000000000000000000",
    "__v": 0
  },
  "liquidity": {
    "XE": {
      "token0": "0",
      "token1": "0",
      "percent": "0"
    },
    "XV": {
      "token0": "0",
      "token1": "0",
      "percent": "0"
    },
    "VE": {
      "token0": "0",
      "token1": "0",
      "percent": "0"
    }
  }
}
```
# Monitoring
## Check application status
It is used to check the status of the application. Returns JSON `{ status: 'up' }` and code 200 if all is well.
### Request
`GET /api/app/health`
```bash
curl -i -H 'Accept: application/json' http://localhost:8080/api/app/health
```
### Response
```json
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: *
Content-Type: application/json; charset=utf-8
Content-Length: 15
ETag: W/"f-i5/AyWii08XahiBIyiQB5+ge7Y8"
Date: Mon, 05 Oct 2020 10:23:22 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"up"}
```

# Storage
The application uses the *MongoDB* database for data storage. At least once a minute, the application accesses the database to store certain information.
