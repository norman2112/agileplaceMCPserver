---
title: Core Concepts
public: true
repo: none
---
## Overview
Our RESTful API allows you to programmatically leverage the power of LeanKit. All APIs use https and are based at `https://<yourhostname>.leankit.com/io/`. Our APIs use standard http authentication, response codes, and verbs. Data is sent and received as JSON unless specified otherwise.

## APIs and Versioning
New endpoints that may have a higher chance of change should be labeled with a 'preview' flag. Our [legacy API](https://success.planview.com/Planview_LeanKit/API/Application_API_-_v1) has been marked for deprecation. We do not suggest using the legacy endpoints unless you need functionality that does not exist in the current version.

Reporting data is available using our [reporting API](https://success.planview.com/Planview_LeanKit/Reporting/Advanced_Reporting_API_Endpoints) endpoints. Please be aware that data retrieved through these APIs is not real-time and may be 24 hours out of date.

Our [user provisioning API](https://success.planview.com/Planview_LeanKit/API/User_Provisioning_API) implements SCIM 1.1.

## Authentication
Two forms of authentication are supported: basic and bearer.

### Basic
The username and password are base64-encoded and appended to the header of each HTTP request with [basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication).
```
curl -H 'Authorization: Basic base64encodedcredentialshere' https://myaccount.leankit.com/io/user/me
```
### Bearer Token

Basic authentication can be used to make a POST request to retrieve a token. That token is used for authentication in subsequent requests.

> __Create and manage your tokens by choosing the "My API Tokens" tab in your LeanKit User Profile.__

Tokens can also be created using API calls. Example token request:
```
curl -X POST \
  https://myaccount.leankit.com/io/auth/token \
  -H 'Authorization: Basic base64encodedcredentialshere' \
  -H 'Content-Type: application/json' \
  -d '{ "description": "description for your app" }'
```

Example response body:
```
{
    "id": "12345678",
    "token": "longstringwiththetokenhere",
    "description": "description for your app",
    "createdOn": "2019-12-24T22:42:40.755Z"
}
```

Subsequent requests would include an Authorization header with the token:
```
curl -H 'Authorization: Bearer yourtokenhere' https://myaccount.leankit.com/io/user/me
```

Additional information can be found in the [token management operations](/markdown/token-auth/list.md) documentation.

_Note: Tokens do not have an expiration date. Regularly revoke tokens that you are not actively using._

## HTTP Method Override Header
Our api uses a number of HTTP methods in addition to the more common `GET` and `POST` requests. The documentation for each endpoint shows which methods should be used. However, if you are using software that limits or excludes `PUT`, `PATCH`, and `DELETE`, we offer a work around. You can instead make a `POST` request with the `X-HTTP-Method-Override` header set to the desired method.

For example, to delete a card directly with `DELETE`:

```
curl -X DELETE \
  https://myaccount.leankit.com/io/card/1234 \
  -H 'Authorization: Bearer yourtokenhere'
```

Here is the same request using the override header and a `POST` method (The `-d ''` is just an empty body):

```
curl -X POST \
  https://myaccount.leankit.com/io/card/1234 \
  -H 'Authorization: Bearer yourtokenhere' \
  -H 'X-HTTP-Method-Override: DELETE' \
  -d ''
```

## Parameters and Headers
For POST, PATCH, PUT, and DELETE requests, parameters not included in the URL should be encoded as JSON with a `Content-Type: application/json`.

`Accept: application/json` header should be sent unless specified otherwise.

## Date Format
Dates in the API use UTC and are strings in the ISO 8601 format:
`2019-12-24T13:29:31Z`

## Common Responses and Errors
Http response codes represent success or error. Codes in the `2xx` range indicate success. Codes in the `4xx` range indicate that some information provided was incorrect. An example would be a `422` response code if you failed to specify a list of card ids when they are required. `5xx` level errors indicate a problem on the LeanKit server side.

## Paging
Many of our list endpoints support paging. The `limit` parameter controls the number of records returned. The `offset` parameter controls the number of records to skip before returning results. The response also includes page metadata to indicate how many records there are in total.
```json
    "pageMeta": {
        "totalRecords": 372,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 25
    },
```

## Rate Limiting
While most of our API use has limited impact on the rest of our systems, occasionally a bug in an integration or a misunderstanding about our APIs leads to excessive API usage. Rate limiting has been put in place to provide generous access to our API while still protecting the integrity of our systems. Please take time to [read about rate limiting](/markdown/01-overview/rate-limiting.md) before you start using the API.
---
title: Getting Started
public: false
---
# So, you want to do something cool with LeanKit?

How do I find ID's?

Your first api call
* create an auth token
* create a card
* view a card
* move a card
---
title: Rate Limiting
public: true
repo: none
---
## Overview
Being able to extend your daily LeanKit Board use into custom automations, integrations and more with the LeanKit API opens up a whole world of possibilities. People are using our API for everything from managing software deployments to custom business reporting solutions. While most of our API use has limited impact on the rest of our systems, occasionally a bug in an integration or a misunderstanding about our APIs leads to excessive API usage. Rate limiting has been put in place to provide generous access to our API while still protecting the integrity of our systems.

### Who is limited?
The API rate limit is per authenticated user and is shared among all of their api tokens and authentication methods. Hitting the API rate limit will not prevent the user from using the web interface to access their LeanKit boards.

### What are the limits?
We maintain the ability to adjust the rates as needed for the health of the system. Due to this fact, instead of planning for a specific rate of requests your code should inspect the HTTP headers we add to each response so you know when you are approaching your limit.

These headers are added to each response:
* `X-RateLimit-Limit` – The total number of points you can use per time window. The current time window is 60 seconds from your first request. If you observe a header with a value of `120` for instance, you can make calls worth 120 points in a 60 second window. Most requests consume `1` point per request, though others may consume more points per request if the route is computationally expensive.
* `X-RateLimit-Remaining` – The number of points remaining in this time window.
* `X-RateLimit-Reset` – This is a Unix Timestamp that tells you exactly when this rate limiting window ends. The formula you'll want to use is: `X-RateLimit-Reset - Current Time = Remaining Time`. Once you have this time, you can divide the `X-RateLimit-Remaining` by `Remaining Time` and see how fast you can make requests without exceeding your limits.

There is one additional header that is returned only on `429 Too Many Requests` responses when you have trigged the rate limiting:
* `Retry-After` – This will give you a date formatted like this: `Fri, 12 Mar 2021 14:21:09 GMT`. If you receive a `429` you should use either this header or `X-RateLimit-Reset` to set a timer and _not_ make any further requests until that time has been reached. You can read more about this header in the [HTTP RFC](https://tools.ietf.org/html/rfc7231#section-7.1.3) or on [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After).

## Recommended Approach
While advanced users may be able to fully leverage the headers from the previous section, most of this can be avoided if you follow the guidelines in the next section which includes handling a `429` in the event you hit the limits.

### Tips for responsible integrations
Computers can execute calls against our system much faster than humans. While it may be tempting to execute 20 requests in parallel, this is good way to quickly consume the limits. Here are a few tips for creating a responsible integration:

* **Execute a limited number of requests in parallel.** If you make requests one after another, the natural delay while data is returned will help spread out your API requests.
* **Cache the data returned where you can.** If you need to look up a lane ID using its label, store the response and reuse the ID for subsequent calls instead of asking for it each time your script runs.
* **Work with a set of changes instead of polling.** Instead of polling the API for the full contents of every card you are interested in, use the `since` param on our [Card List endpoint](/markdown/card/list.md) to ask only for cards that have changed since you last fetched them.
* **Properly handle 429 Too Many Requests responses.** In the event your script runs too fast, be prepared for a `429` HTTP response for a request and retry it once the specified time has elapsed.

### Code Example

This example uses JavaScript and the popular `axios` request client for node. It leverages each of the techniques except caching from the list of tips. This uses both the [Card List](/markdown/card/list.md) and [Card Get](/markdown/card/get.md) endpoints

_Technical note: This example requires at least Node 14 and `"type": "module"` to be set in the `package.json`._

```js
import axios from "axios";

const LEANKIT_DOMAIN = "YOURDOMAIN.leankit.com";

/* Set up axios instance with headers and base url already filled in */
const axiosInstance = axios.create( {
    baseURL: `https://${ LEANKIT_DOMAIN }/`,
    timeout: 1000,
    headers: {
        Authorization: `Bearer ${ process.env.LEANKIT_API_TOKEN }`,
        Accept: "application/json"
    }
} );

const TOO_MANY_REQUESTS = 429;
async function makeRequest( ...props ) {
    try {
        console.log( "Making request", ...props );
        const response = await axiosInstance( ...props );
        return response.data;
    } catch (error) {
        /* Detect the 429 response */
        if ( error?.response?.status === TOO_MANY_REQUESTS ) {
            /* Convert the Retry-After header to a date.
               Note: axios makes all headers lower case so that is why we use "retry-after" */
            const retryAfter = new Date( error.response.headers[ "retry-after" ] );
            const timeoutInMs = retryAfter - Date.now();

            /* Wait the specified amount before making the next call */
            console.log( `Received a 429 response, waiting ${ ( timeoutInMs / 1000 ).toPrecision( 2 ) } seconds before continuing…` )
            await new Promise( res => setTimeout( res, timeoutInMs ) );

            return makeRequest( ...props );
        }

        /* Add other error handling here as needed */
        throw error;
    }
}

async function main( { boardId, since }) {
    /* Get a list of card ids that have changed */
    const { cards } = await makeRequest({
        method: "get",
        url: "/io/card",
        params: {
            board: boardId,
            only: "id",
            since: since.toISOString()
        }
    } );

    const fullCards = [];

    /* Ask for each card one at a time */
    for (const { id } of cards ) {
        const card = await makeRequest( {
            method: "get",
            url: `/io/card/${ id }`
        } );
        fullCards.push( card );
    }

    /* ... do something with these cards */
}

main( {
    /* Target Board Id */
    boardId: "000000000",

    /* Changes for the past week */
    since: new Date( new Date() - 7 )
} ).catch( console.error );
```

---
title: TimeZones
public: true
repo: none
---
# TimeZone Values
Several API endpoints allow users to specify an Olson Time Zone ID for a user or a report. TimeZones must be specified exactly as they appear here.

### Supported Olson timeZones
  * Etc/GMT+12
  * Etc/GMT+11
  * America/Adak
  * Pacific/Honolulu
  * Pacific/Marquesas
  * America/Anchorage
  * Etc/GMT+9
  * America/Tijuana
  * Etc/GMT+8
  * America/Los_Angeles
  * America/Phoenix
  * America/Chihuahua
  * America/Denver
  * America/Guatemala
  * America/Chicago
  * Pacific/Easter
  * America/Mexico_City
  * America/Regina
  * America/Bogota
  * America/Cancun
  * America/New_York
  * America/Port-au-Prince
  * America/Havana
  * America/Indianapolis
  * America/Asuncion
  * America/Halifax
  * America/Caracas
  * America/Cuiaba
  * America/La_Paz
  * America/Santiago
  * America/Grand_Turk
  * America/St_Johns
  * America/Araguaina
  * America/Sao_Paulo
  * America/Cayenne
  * America/Buenos_Aires
  * America/Godthab
  * America/Montevideo
  * America/Punta_Arenas
  * America/Miquelon
  * America/Bahia
  * Etc/GMT+2
  * Atlantic/Azores
  * Atlantic/Cape_Verde
  * Etc/GMT
  * Africa/Casablanca
  * Europe/London
  * Atlantic/Reykjavik
  * Europe/Berlin
  * Europe/Budapest
  * Europe/Paris
  * Africa/Sao_Tome
  * Europe/Warsaw
  * Africa/Lagos
  * Asia/Amman
  * Europe/Bucharest
  * Asia/Beirut
  * Africa/Cairo
  * Europe/Chisinau
  * Asia/Damascus
  * Asia/Hebron
  * Africa/Johannesburg
  * Europe/Kiev
  * Asia/Jerusalem
  * Europe/Kaliningrad
  * Africa/Khartoum
  * Africa/Tripoli
  * Africa/Windhoek
  * Asia/Baghdad
  * Europe/Istanbul
  * Asia/Riyadh
  * Europe/Minsk
  * Europe/Moscow
  * Africa/Nairobi
  * Asia/Tehran
  * Asia/Dubai
  * Europe/Astrakhan
  * Asia/Baku
  * Europe/Samara
  * Indian/Mauritius
  * Europe/Saratov
  * Asia/Tbilisi
  * Asia/Yerevan
  * Asia/Kabul
  * Asia/Tashkent
  * Asia/Yekaterinburg
  * Asia/Karachi
  * Asia/Calcutta
  * Asia/Colombo
  * Asia/Katmandu
  * Asia/Almaty
  * Asia/Dhaka
  * Asia/Omsk
  * Asia/Rangoon
  * Asia/Bangkok
  * Asia/Barnaul
  * Asia/Hovd
  * Asia/Krasnoyarsk
  * Asia/Novosibirsk
  * Asia/Tomsk
  * Asia/Shanghai
  * Asia/Irkutsk
  * Asia/Singapore
  * Australia/Perth
  * Asia/Taipei
  * Asia/Ulaanbaatar
  * Australia/Eucla
  * Asia/Chita
  * Asia/Tokyo
  * Asia/Pyongyang
  * Asia/Seoul
  * Asia/Yakutsk
  * Australia/Adelaide
  * Australia/Darwin
  * Australia/Brisbane
  * Australia/Sydney
  * Pacific/Port_Moresby
  * Australia/Hobart
  * Asia/Vladivostok
  * Australia/Lord_Howe
  * Pacific/Bougainville
  * Asia/Srednekolymsk
  * Asia/Magadan
  * Pacific/Norfolk
  * Asia/Sakhalin
  * Pacific/Guadalcanal
  * Asia/Kamchatka
  * Pacific/Auckland
  * Etc/GMT-12
  * Pacific/Fiji
  * Pacific/Chatham
  * Etc/GMT-13
  * Pacific/Tongatapu
  * Pacific/Apia
  * Pacific/Kiritimati
---
title: Get my account settings
public: false
repo: core-account-service
deprecated: true
---
# GET /io/account/me
Get account settings (deprecated)
### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/account' \
  -H 'Authorization: Basic base64encodedauth'
```
### Example Response
200 Success
```json
{
    "id": "10146000303",
    "userLimit": 22,
    "country": "UNITED STATES",
    "region": "NEW YORK",
    "enableCumulativeFlowDiagram": true,
    "enableCycleTimeDiagram": true,
    "enableCardDistributionDiagram": true,
    "enableEfficiencyDiagram": true,
    "enableProcessControlDiagram": true,
    "enableAdvancedRoleSecurity": true,
    "enableTaskBoards": true,
    "enableDrillThroughBoards": true,
    "enableMultipleDrillThroughBoards": true,
    "enableQuickConnectionsUI": false,
    "enableCustomCardFields": true,
    "defaultRoleId": 4,
    "numberOfDaysToRetrieveAnalyticsEventsFor": 90,
    "enableSharedBoards": true,
    "defaultNewBoardRole": 0,
    "allowMultiUserAssignments": true,
    "enableNodeCardCreate": true,
    "enableConnectedCardsGallery": true,
    "disableCalendarView": false,
    "allowBoardTemplatesCreate": true,
    "allowBoardTemplatesImportExport": true,
    "allowAllTemplates": true,
    "allowCardsInBoardTemplates": true,
    "allowBoardCreationFromTemplates": true,
    "expiresOn": null,
    "reportingApiTokenExpirationInMinutes": 60,
    "reportingApiResponseCacheDurationInMinutes": 1440,
    "enableReportingApiCardExport": true,
    "enableReportingApiCardLaneHistory": true,
    "enableReportingApiCurrentUserAssignments": true,
    "enableReportingApiHistoricalUserAssignments": true,
    "enableReportingApiLanes": true,
    "enableReportingApiTags": true,
    "enableReportingApiTasks": true,
    "enableReportingApiTaskLanes": true,
    "enableReportingApiCustomFields": true,
    "enableReportingApiBlockedHistory": true,
    "enableReportingApiComments": true,
    "enableReportingApiConnections": true,
    "enableExportBoardHistory": true,
    "enableReportTimelineActualDate": false,
    "enableCardHistoryHealthTab": true,
    "accountType": "selectEdition",
    "accountStatus": "active"
}
```
---
title: Get my account settings
public: true
repo: core-account-service
---
# GET /io/account
Get account settings.
### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/account' \
  -H 'Authorization: Basic base64encodedauth'
```
### Example Response
200 Success
```json
{
    "id": "10146000303",
    "userLimit": 22,
    "country": "UNITED STATES",
    "region": "NEW YORK",
    "enableCumulativeFlowDiagram": true,
    "enableCycleTimeDiagram": true,
    "enableCardDistributionDiagram": true,
    "enableEfficiencyDiagram": true,
    "enableProcessControlDiagram": true,
    "enableAdvancedRoleSecurity": true,
    "enableTaskBoards": true,
    "enableDrillThroughBoards": true,
    "enableMultipleDrillThroughBoards": true,
    "enableQuickConnectionsUI": false,
    "enableCustomCardFields": true,
    "defaultRoleId": 4,
    "numberOfDaysToRetrieveAnalyticsEventsFor": 90,
    "enableSharedBoards": true,
    "defaultNewBoardRole": 0,
    "allowMultiUserAssignments": true,
    "enableNodeCardCreate": true,
    "enableConnectedCardsGallery": true,
    "disableCalendarView": false,
    "allowBoardTemplatesCreate": true,
    "allowBoardTemplatesImportExport": true,
    "allowAllTemplates": true,
    "allowCardsInBoardTemplates": true,
    "allowBoardCreationFromTemplates": true,
    "expiresOn": null,
    "reportingApiTokenExpirationInMinutes": 60,
    "reportingApiResponseCacheDurationInMinutes": 1440,
    "enableReportingApiCardExport": true,
    "enableReportingApiCardLaneHistory": true,
    "enableReportingApiCurrentUserAssignments": true,
    "enableReportingApiHistoricalUserAssignments": true,
    "enableReportingApiLanes": true,
    "enableReportingApiTags": true,
    "enableReportingApiTasks": true,
    "enableReportingApiTaskLanes": true,
    "enableReportingApiCustomFields": true,
    "enableReportingApiBlockedHistory": true,
    "enableReportingApiComments": true,
    "enableReportingApiConnections": true,
    "enableExportBoardHistory": true,
    "enableReportTimelineActualDate": false,
    "enableCardHistoryHealthTab": true,
    "accountType": "selectEdition",
    "accountStatus": "active"
}
```
---
title: Create a trial account
public: false
repo: core-account-service
---
# POST /io/account/trial
Create and account, organization, account owner and welcome board. Currently the account is created as a LeanKit for Scaled Teams Trial.

Returns a JWT with short expiration that can be used to log into the account.

_Does NOT require authentication_

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`hostname`*|string|Hostname of the organization.||
|`company`*|string|Company name||
|`firstName`*|string|Account owner first name||
|`lastName`*|string|Account owner last name ||
|`emailAddress`*|string|Account owner username/email ||
|`password`*|string|Account owner password ||
|`captcha`*|string|Captcha||
|`timeZone`|string|Account owner time zone; See [valid timezones](/markdown/01-overview/time-zones.md). |Etc/GMT|
|`paymentPeriod`|string|PaymentPeriod enum values|'notSpecified'|
|`sendUserEmail`|string|Sends a welcome email to the account owner|true|

\* required

### Example Request Body
```json
{
	"hostname": "myaccount",
	"company": "My Account Name",
	"firstName": "First",
	"lastName": "Last",
	"emailAddress": "user@myaccount.com",
	"password": "1234test!",
	"timeZone": "America/New_York",
  "captcha": "captcha here"
}
```

### Example Response
200 Success
```json
{
    "hostname": "myaccount",
    "accountId": "101000029648348",
    "organizationId": "101000029648349",
    "accountOwnerId": "101000029648350",
    "boardId": "101000029648308",
    "jwt": "xxxxxxxxx"
}
```
---
title: Update my account settings
public: true
repo: core-account-service
---
# PATCH /io/account
Update my account settings.

### Example Request Body (title only)
```json
{
    "title": "My Cool Organization"
}
```
### Example Request Body (all properties)
```json
{
    "title": "My Cool Organization",
    "defaultNewBoardRole": "none",
    "subscribeUsersToAssignedCardsByDefault": false,
    "enableOKRs": true,
    "advancedSecurity": {
        "strongPasswordEnabled": true,
        "minimumLengthEnabled": true,
        "requireUppercaseEnabled": false,
        "requireNumericEnabled": false,
        "requireSpecialCharacterEnabled": false,
        "lengthOfPassword": 3,
        "accountLockEnabled": true,
        "accountLockInterval": 3,
        "maxFailedLoginAttempts": 3,
        "preferencesEnabled": true,
        "disallowedFileExtensions": ".exe",
        "disableRssFeeds": false,
        "disableGenericLogin": false,
        "disableRememberMe": false
    }
}
```
Top level properties (`title`, `defaultNewBoardRole`, `subscribeUsersToAssignedCardsByDefault`, `enableOKRs`, and `advancedSecurity`) are optional.

### Example Response
200 Success
```json
{
    "id": "10100000303",
    "title": "My Cool Organization",
    "defaultNewBoardRole": "none",
    "subscribeUsersToAssignedCardsByDefault": false,
    "enableOKRs": true,
    "advancedSecurity": {
        "strongPasswordEnabled": true,
        "minimumLengthEnabled": true,
        "requireUppercaseEnabled": false,
        "requireNumericEnabled": false,
        "requireSpecialCharacterEnabled": false,
        "lengthOfPassword": 3,
        "accountLockEnabled": true,
        "accountLockInterval": 3,
        "maxFailedLoginAttempts": 3,
        "preferencesEnabled": true,
        "disallowedFileExtensions": ".exe",
        "disableRssFeeds": false,
        "disableGenericLogin": false,
        "disableRememberMe": false
    }
}
```
---
title: Cancel leankit subscription
public: false
repo: core-account-service
---
# DELETE /io/account/subscription
Cancel your LeanKit account subscription.
Only available for monthly-pay accounts and trial accounts.

_Requires an Account Owner user._
### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/account/subscription' \
  -H 'Authorization: Basic base64encodedauth'
```
### Example Response
204 No Content

---
title: Get account subscription info
public: false
repo: core-account-service
---
# GET /io/account/subscription
Get account subscription info.
### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/account/subscription' \
  -H 'Authorization: Basic base64encodedauth'
```
### Example Response
200 Success
```json
{
    "id": "10100430303",
    "title": "MYCO",
    "hostname": "myaccount",
    "userLimit": 22,
    "readerUserLimit": 4,
    "focusedUserLimit": 2,
    "enableReaderUsers": true,
    "enableFocusedUsers": true,
    "boardLimit": 20,
    "users": {
        "full": 6,
        "focused": 1,
        "reader": 1
    },
    "boardCount": 17,
    "owner": {
        "id": "25019",
        "emailAddress": "jim@myco.com",
        "firstName": "Jim",
        "lastName": "Martinsen"
    },
    "nextEditions": [
        {
            "accountType": "leanKitForScaledTeams",
            "monthlyCost": 35,
            "monthlyAnnualCost": 29
        }
    ],
    "accountType": "selectEdition",
    "accountStatus": "active",
    "paymentPeriod": "yearly",
    "editionType": "customer"
}
```

---
title:  Purchase LeanKit subscription
public: false
repo: core-account-service
---
# POST /io/account/subscription
Purchase a LeanKit subscription. Used by the "Purchase Subscription" button in the Account Details tab when using a trial subscription.

_Requires an Account Owner user._
### Example Request
```json
{
    "accountType":"leanKitForScaledTeams",
    "paymentPeriod":"yearly",
    "userLimit":25,
    "firstName":"Joe",
    "lastName":"Smith",
    "address":"123 S Main",
    "country":"United States",
    "state":"TX",
    "city":"Bigtown",
    "zipCode":"76710",
    "emailAddress":"joe@myco.com",
    "phoneNumber":"254-555-1212",
    "specialInstructions":"",
    "acceptServiceAgreement":true,
    "vat": "X1234567890"
}
```
### Example Response
```json
{
    "id": "10113993045",
    "title": "Myco",
    "hostname": "myco",
    "userLimit": 25,
    "readerUserLimit": 0,
    "focusedUserLimit": 0,
    "enableReaderUsers": false,
    "enableFocusedUsers": false,
    "boardLimit": 0,
    "users": {
        "full": 1
    },
    "boardCount": 1,
    "owner": {
        "id": "10113993348",
        "emailAddress": "joe@myco.com",
        "firstName": "Joe",
        "lastName": "Smith"
    },
    "nextEditions": [],
    "accountType": "leanKitForScaledTeams",
    "accountStatus": "active",
    "paymentPeriod": "yearly",
    "editionType": "customer"
}
```
---
title: Update account subscription
public: false
repo: core-account-service
---
# PATCH /io/account/subscription
Update your LeanKit subscription. Typically used to adjust the number of license seats available.
### Example Request Body
```json
{
    "acceptServiceAgreement":true,
    "userLimit":26
}
```
### Example Response
```json
{
    "id": "10113993045",
    "title": "Myco",
    "hostname": "myco",
    "userLimit": 26,
    "readerUserLimit": 0,
    "focusedUserLimit": 0,
    "enableReaderUsers": false,
    "enableFocusedUsers": false,
    "boardLimit": 0,
    "users": {
        "full": 1
    },
    "boardCount": 1,
    "owner": {
        "id": "10113993348",
        "emailAddress": "joe@myco.com",
        "firstName": "Joe",
        "lastName": "Smith"
    },
    "nextEditions": [],
    "accountType": "leanKitForScaledTeams",
    "accountStatus": "active",
    "paymentPeriod": "yearly",
    "editionType": "customer"
}
```
---
title: Account audit
public: false
repo: core-account-service
---
# GET /io/admin/account/:accountId/audit

Get account audit records in the system.

_Requires system administrator access._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first audit record to be returned|0|
|`limit`|integer|Set the number of audit records to be returned|25|


### Example Request
```shell
curl https://myaccount.leankit.com/io/admin/account/12345/audit' \
  -H 'Authorization: Basic base64encodedauth'
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 4,
        "offset": 0,
        "limit": 1,
        "startRow": 1,
        "endRow": 1
    },
    "items": [
        {
            "id": "1",
            "userLimitChange": 0,
            "boardViewerLimitChange": 0,
            "boardLimitChange": 0,
            "changeDate": "2020-05-07T20:13:02.000Z",
            "notes": "The account owner was changed from User One(User.One@the-account.com)[ID:23456] to  User Two (User.Two@the-account.com)[ID:23457].User One",
            "accountId": "12345",
            "readerUserLimitChange": 0,
            "focusedUserLimitChange": 0,
            "organizationId": null,
            "accountType": "leanKitForScaledTeams",
            "paymentPeriod": "yearly",
            "accountStatus": "active",
            "changes": null,
            "modifyingUser": {
                "id": "23458",
                "emailAddress": "User.Three@the-account.com",
                "firstName": "User",
                "lastName": "Three",
                "avatar": "http://the-host.leankit.com/avatar/show/23458/?s=25"
            }
        }
    ]
}
```
---
title: Create an account
public: false
repo: core-account-service
---
# POST /io/admin/account
Create an account, organization, account owner and welcome board. Currently the account is created as a LeanKit for Scaled Teams Trial.

_Requires system administrator access._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`hostname`*|string|Hostname of the organization.||
|`company`*|string|Company name||
|`firstName`*|string|Account owner first name||
|`lastName`*|string|Account owner last name ||
|`emailAddress`*|string|Account owner username/email ||
|`password`*|string|Account owner password ||
|`timeZone`|string|Account owner time zone; see [valid timezones](/markdown/01-overview/time-zones.md). |Etc/GMT|
|`paymentPeriod`|string|PaymentPeriod enum values|'notSpecified'|
|`sendUserEmail`|string|Sends a welcome email to the account owner|true|
|`userLimit`|integer|Sets the max number of users for the account||
|`readerUserLiimt`|integer|Sets the max number of reader users for the account||

### Example Request Body
```json
{
	"hostname": "myaccount",
	"company": "My Account Name",
	"firstName": "First",
	"lastName": "Last",
	"emailAddress": "user@myaccount.com",
	"password": "1234test!",
	"timeZone": "America/New_York",
	"paymentPeriod": "monthly",
	"sendUserEmail": false,
  "userLimit": 10,
  "readerUserLimit": 5
}
```

### Example Response
200 Success
```json
{
    "hostname": "myaccount",
    "accountId": "101000029648348",
    "organizationId": "101000029648349",
    "accountOwnerId": "101000029648350",
    "boardId": "101000029648308"
}
```
---
title: Delete an account
public: false
repo: core-account-service
---
# DELETE /io/admin/account/:accountId

Queue a job to delete an account and all related data (transactional and reporting). Account must be suspended or merged.

_Requires system administrator access._

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/admin/account/0000' \
  -H 'Authorization: Basic base64encodedauth'
```

### Example Successful Response

202 Accepted
---
title: Get account subscription info for any account
public: false
repo: core-account-service
---
# GET /io/admin/account/:accountId/subscription

Get account subscription info for any account.

_Requires system administrator access._

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/admin/account/0000/subscription' \
  -H 'Authorization: Basic base64encodedauth'
```
### Example Response
200 Success
```json
{
    "id": "10100430303",
    "title": "MYCO",
    "hostname": "myaccount",
    "userLimit": 22,
    "readerUserLimit": 4,
    "focusedUserLimit": 2,
    "enableReaderUsers": true,
    "enableFocusedUsers": true,
    "boardLimit": 20,
    "users": {
        "full": 6,
        "focused": 1,
        "reader": 1
    },
    "boardCount": 17,
    "owner": {
        "id": "25019",
        "emailAddress": "jim@myco.com",
        "firstName": "Jim",
        "lastName": "Martinsen"
    },
    "nextEditions": [
        {
            "accountType": "leanKitForScaledTeams",
            "monthlyCost": 35,
            "monthlyAnnualCost": 29
        }
    ],
    "accountType": "selectEdition",
    "accountStatus": "active",
    "paymentPeriod": "yearly",
    "editionType": "customer",
    "lastAccess": "2021-02-01T08:12:45.234Z"
}
```

---
title: Get account settings for any account
public: false
repo: core-account-service
---
# GET /io/admin/account/:accountId

Get account settings for any account.

_Requires system administrator access._

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/admin/account/3210114062028' \
  -H 'Authorization: Basic base64encodedauth'
```
Note: User must have access to the account identified by the hostname (`myaccount` in this example), but the account queried is based off `accountId` provided in the url. They do not need to match.
### Example Response
200 Success
```json
{
    "id": "3210114062028",
    "discountCode": null,
    "boardLimit": 0,
    "userLimit": 150,
    "numberOfDaysToRetrieveAnalyticsEventsFor": 365,
    "readerUserLimit": 10,
    "focusedUserLimit": 10,
    "maxFileSizeInKbs": 76800,
    "maxStorageAllowedInMbs": "10485760",
    "maxImportFileSizeInKbs": 2048,
    "country": null,
    "region": null,
    "freshbooksClientId": null,
    "churnDate": null,
    "adminsContact": null,
    "policiesUrl": null,
    "loginPageBannerText": null,
    "disallowedFileExtensions": null,
    "archiveCardDays": 14,
    "maxNumberOfInvitations": 200,
    "numberOfTaskboardsCategories": 0,
    "samlNameIdFormat": "v20Unspecified",
    "samlAuthContext": "passwordProtectedTransport",
    "samlAuthContextComparisonType": "exact",
    "samlRequestIssuer": null,
    "idProviderUrl": null,
    "idProviderKey": null,
    "reportingApiTokenExpirationInMinutes": 10080,
    "reportingApiResponseCacheDurationInMinutes": 1440,
    "enableReaderUsers": false,
    "enableFocusedUsers": false,
    "disableRssFeeds": false,
    "disableGenericLogin": false,
    "disableRememberMe": false,
    "enableSearchByInternalCardId": false,
    "disableCalendarView": true,
    "enableSuspensionWarning": false,
    "enableOrganizationSettings": true,
    "enableLanePolicies": true,
    "enableLaneSubscription": true,
    "enableCardHistory": true,
    "enableWipLimit": true,
    "enableUserGuides": false,
    "allowEnterpriseOneIntegration": false,
    "enablePlanviewIntegration": false,
    "isSslEnabled": true,
    "allowAllTemplates": true,
    "allowBoardCreationFromTemplates": true,
    "allowHorizontalSplitInBoardEdit": true,
    "enableGlobalSearch": true,
    "enableSearch": true,
    "enableFilters": true,
    "enableActivityStream": true,
    "allowComments": true,
    "subscribeUsersToAssignedCardsByDefault": true,
    "allowAttachments": true,
    "enableInvitationSystem": true,
    "allowInvitationsFromAllUsers": false,
    "allowMultiUserAssignments": true,
    "enableImportCards": true,
    "enableExportCards": true,
    "enableExportBoardHistory": true,
    "allowBoardTemplatesCreate": true,
    "enableTaskBoards": true,
    "enableSelectAllUsers": true,
    "enableUserAdminReports": true,
    "classOfServiceEnabled": true,
    "enableCustomCardFields": true,
    "externalCardIdEnabled": true,
    "allowBoardCloning": true,
    "enableDrillThroughBoards": true,
    "enableMultipleDrillThroughBoards": true,
    "allowBoardTemplatesImportExport": true,
    "allowRepliableNotifications": true,
    "allowMoveCardsBetweenBoards": true,
    "allowCardsInBoardTemplates": true,
    "enableSharedBoards": true,
    "allowedSharedBoardRoles": 6,
    "omitSharedBoardReaders": false,
    "enableCustomBoardUrls": true,
    "enableAdvancedSecurity": true,
    "enableUserDevice": false,
    "enableBoardCreatorRole": true,
    "allowTaskboardCategoryEdit": false,
    "allowTaskTypeFiltering": true,
    "allowSeparateCardAndTaskTypes": true,
    "allowAddCardTypes": true,
    "enableTagManagement": true,
    "enableCardDelegation": false,
    "enableConnectedCardsGallery": true,
    "enableUserProvisioningApi": true,
    "enableMyCards": false,
    "enableSavedFilters": true,
    "enableAdvancedRoleSecurity": true,
    "enableSingleSignOn": false,
    "enableCustomerContinueBypass": false,
    "enableSupportSsoBypass": false,
    "enableProcessControlDiagram": true,
    "enableCumulativeFlowDiagram": true,
    "enableCardDistributionDiagram": true,
    "enableEfficiencyDiagram": true,
    "enableConstraintLogReport": false,
    "enablePlannedPercentCompleteReport": true,
    "enableBurndownDiagram": true,
    "enableReworkReport": false,
    "enableExceptionReport": true,
    "enableAssignedUsersReport": true,
    "enableOrgExceptionsDiagram": true,
    "enableReportForecast": false,
    "enableReportExceptionsWeb": true,
    "enableReportTimeline": true,
    "enableReportTimelineLegacy": false,
    "enableReportTimelineActualDate": true,
    "enableCardHistoryHealthTab": true,
    "enableReportingApiCardExport": true,
    "enableReportingApiCardLaneHistory": true,
    "enableReportingApiCurrentUserAssignments": true,
    "enableReportingApiHistoricalUserAssignments": true,
    "enableReportingApiLanes": true,
    "enableReportingApiTags": true,
    "enableReportingApiTasks": true,
    "enableReportingApiConnections": true,
    "enableReportingApiTaskLanes": false,
    "enableReportingApiCustomFields": true,
    "enableReportingApiBlockedHistory": true,
    "enableReportingApiComments": true,
    "organizationId": "3310114062029",
    "title": "Kanbanomation / LeanKitForScaledTeams",
    "hostname": "testy-scaled",
    "expiresOn": null,
    "enablePlanviewIntegrationForE1": false,
    "enablePlanviewIntegrationForPPMP": false,
    "enablePlanviewIntegrationMultipleInstances": false,
    "salesforceId": null,
    "enablePlanviewId": false,
    "samlValidateInResponseTo": false,
    "samlResponseUrl": null,
    "owner": {
        "id": "3310114062030",
        "emailAddress": "test_admin@leankit.com",
        "firstName": "Admin",
        "lastName": "User"
    },
    "accountType": "leanKitForScaledTeams",
    "paymentPeriod": "yearly",
    "accountStatus": "active",
    "defaultRole": "boardAdministrator",
    "customerType": "standard",
    "enableIpFilter": true,
    "ipFilterReportOnlyMode": true,
    "allowedIpRanges": "192.168.1.1/24\n192.168.2.1/24"
}
```
---
title: List accounts
public: false
repo: core-account-service
---
# GET /io/admin/account

List or search accounts in the system.

_Requires system administrator access._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first account to be returned|0|
|`limit`|integer|Set the number of accounts to be returned|25|
|`search`|string|Keyword match by account title or hostname||
|`emailAddress`|string|Return any organizations that the user is a member of||
|`accountType`|array|Array of valid account types to filter by||
|`accountStatus`|array|Array of valid account statuses to filter by. Also supports a value of `expired`||
|`createdSince`|integer|Filter by accounts created within the specified number of days||
|`accountIds`|array|List of account ids to search by. Maximum of 100||


### Example Request
```shell
curl https://myaccount.leankit.com/io/admin/account' \
  -H 'Authorization: Basic base64encodedauth'
```

### Example Successful Response

200 Success
```json
{
  "pageMeta": {
    "endRow": 1,
    "limit": 25,
    "offset": 0,
    "startRow": 1,
    "totalRecords": 1
  },
  "accounts": [
    {
      "accountStatus": "active",
      "accountType": "leanKitForEnterprise",
      "boardLimit": 10,
      "country": "France",
      "focusedUserLimit": 40,
      "hostname": "anothertest",
      "id": "6",
      "owner": {
        "emailAddress": "owner2@test.com",
        "id": "2"
      },
      "paymentPeriod": "notSpecified",
      "readerUserLimit": 30,
      "title": "Another Test",
      "userLimit": 20
    }
  ]
```
---
title: Update an account
public: false
repo: core-account-service
---
# PATCH /io/admin/account/:accountId
Update account settings.

_Requires system administrator access._

### Sample Request
At least one of the available properties below must be included in the request body.
```json
{
    "discountCode": "none",
    "boardLimit": 0,
    "userLimit": 10,
    "numberOfDaysToRetrieveAnalyticsEventsFor": 180,
    "readerUserLimit": 0,
    "focusedUserLimit": 0,
    "maxFileSizeInKbs": 76800,
    "maxStorageAllowedInMbs": "10485760",
    "maxImportFileSizeInKbs": 2048,
    "country": "-",
    "region": "-",
    "freshbooksClientId": "",
    "churnDate": "2021-12-31",
    "adminsContact": "",
    "policiesUrl": "",
    "loginPageBannerText": "",
    "disallowedFileExtensions": "",
    "archiveCardDays": 14,
    "maxNumberOfInvitations": 200,
    "numberOfTaskboardsCategories": 0,
    "samlNameIdFormat": "v20Unspecified",
    "samlAuthContext": "passwordProtectedTransport",
    "samlAuthContextComparisonType": "exact",
    "samlRequestIssuer": "",
    "idProviderUrl": "",
    "idProviderKey": "",
    "reportingApiTokenExpirationInMinutes": 10080,
    "reportingApiResponseCacheDurationInMinutes": 1440,
    "enableReaderUsers": false,
    "enableFocusedUsers": false,
    "disableRssFeeds": false,
    "disableGenericLogin": false,
    "disableRememberMe": false,
    "enableSearchByInternalCardId": false,
    "disableCalendarView": true,
    "enableSuspensionWarning": false,
    "enableOrganizationSettings": true,
    "enableLanePolicies": true,
    "enableLaneSubscription": true,
    "enableCardHistory": true,
    "enableWipLimit": true,
    "enableUserGuides": true,
    "allowEnterpriseOneIntegration": false,
    "enablePlanviewIntegration": false,
    "isSslEnabled": true,
    "allowAllTemplates": true,
    "allowBoardCreationFromTemplates": true,
    "allowHorizontalSplitInBoardEdit": true,
    "enableGlobalSearch": true,
    "enableSearch": true,
    "enableFilters": true,
    "enableActivityStream": true,
    "allowComments": true,
    "subscribeUsersToAssignedCardsByDefault": true,
    "allowAttachments": true,
    "enableInvitationSystem": true,
    "allowInvitationsFromAllUsers": false,
    "allowMultiUserAssignments": true,
    "enableImportCards": true,
    "enableExportCards": true,
    "enableExportBoardHistory": true,
    "allowBoardTemplatesCreate": true,
    "enableTaskBoards": true,
    "enableSelectAllUsers": true,
    "enableUserAdminReports": true,
    "classOfServiceEnabled": true,
    "enableCustomCardFields": true,
    "externalCardIdEnabled": true,
    "allowBoardCloning": true,
    "enableDrillThroughBoards": true,
    "enableMultipleDrillThroughBoards": true,
    "allowBoardTemplatesImportExport": true,
    "allowRepliableNotifications": true,
    "allowMoveCardsBetweenBoards": true,
    "allowCardsInBoardTemplates": true,
    "enableSharedBoards": true,
    "allowedSharedBoardRoles": 6,
    "omitSharedBoardReaders": false,
    "enableCustomBoardUrls": true,
    "enableAdvancedSecurity": true,
    "enableUserDevice": false,
    "enableBoardCreatorRole": true,
    "allowTaskboardCategoryEdit": false,
    "allowTaskTypeFiltering": true,
    "allowSeparateCardAndTaskTypes": true,
    "allowAddCardTypes": true,
    "enableTagManagement": true,
    "enableCardDelegation": false,
    "enableConnectedCardsGallery": true,
    "enableUserProvisioningApi": true,
    "enableMyCards": true,
    "enableSavedFilters": true,
    "enableAdvancedRoleSecurity": true,
    "enableSingleSignOn": false,
    "enableCustomerContinueBypass": false,
    "enableSupportSsoBypass": false,
    "enableProcessControlDiagram": true,
    "enableCumulativeFlowDiagram": true,
    "enableCardDistributionDiagram": true,
    "enableEfficiencyDiagram": true,
    "enableConstraintLogReport": false,
    "enablePlannedPercentCompleteReport": true,
    "enableBurndownDiagram": true,
    "enableReworkReport": false,
    "enableExceptionReport": false,
    "enableAssignedUsersReport": true,
    "enableOrgExceptionsDiagram": true,
    "enableReportForecast": false,
    "enableReportExceptionsWeb": true,
    "enableReportTimeline": true,
    "enableReportTimelineLegacy": false,
    "enableReportTimelineActualDate": true,
    "enableCardHistoryHealthTab": true,
    "enableReportingApiCardExport": true,
    "enableReportingApiCardLaneHistory": true,
    "enableReportingApiCurrentUserAssignments": true,
    "enableReportingApiHistoricalUserAssignments": true,
    "enableReportingApiLanes": true,
    "enableReportingApiTags": true,
    "enableReportingApiTasks": true,
    "enableReportingApiConnections": true,
    "enableReportingApiTaskLanes": false,
    "enableReportingApiCustomFields": true,
    "enableReportingApiBlockedHistory": true,
    "enableReportingApiComments": true,
    "title": "FlintzAcme",
    "hostname": "acme",
    "expiresOn": "2021-12-31",
    "enablePlanviewIntegrationForE1": false,
    "enablePlanviewIntegrationForPPMP": false,
    "enablePlanviewIntegrationMultipleInstances": false,
    "salesforceId": "",
    "enablePlanviewId": false,
    "samlValidateInResponseTo": false,
    "samlResponseUrl": "/login/saml",
    "accountType": "leanKitForScaledTeams",
    "paymentPeriod": "yearly",
    "accountStatus": "active",
    "defaultRole": "boardAdministrator",
    "customerType": "standard",
    "platformServicesOptInConfirmed": false,
    "enableOKRs": true,
    "enableIpFilter": true,
    "ipFilterReportOnlyMode": true,
    "allowedIpRanges": "192.168.1.1/24\n192.168.2.1/24"
}
```

_Note:_ `platformServicesOptInConfirmed` can only be set to `false` on this endpoint. Enabling must be done by an account administrator.
### Example Response
The response object is the same as the GET response.
200 Success
```json
{
    "id": "3210114062028",
    "discountCode": null,
    "boardLimit": 0,
    "userLimit": 150,
    "numberOfDaysToRetrieveAnalyticsEventsFor": 365,
    "readerUserLimit": 10,
    "focusedUserLimit": 10,
    "maxFileSizeInKbs": 76800,
    "maxStorageAllowedInMbs": "10485760",
    "maxImportFileSizeInKbs": 2048,
    "country": null,
    "region": null,
    "freshbooksClientId": null,
    "churnDate": null,
    "adminsContact": null,
    "policiesUrl": null,
    "loginPageBannerText": null,
    "disallowedFileExtensions": null,
    "archiveCardDays": 14,
    "maxNumberOfInvitations": 200,
    "numberOfTaskboardsCategories": 0,
    "samlNameIdFormat": "v20Unspecified",
    "samlAuthContext": "passwordProtectedTransport",
    "samlAuthContextComparisonType": "exact",
    "samlRequestIssuer": null,
    "idProviderUrl": null,
    "idProviderKey": null,
    "reportingApiTokenExpirationInMinutes": 10080,
    "reportingApiResponseCacheDurationInMinutes": 1440,
    "enableReaderUsers": false,
    "enableFocusedUsers": false,
    "disableRssFeeds": false,
    "disableGenericLogin": false,
    "disableRememberMe": false,
    "enableSearchByInternalCardId": false,
    "disableCalendarView": true,
    "enableSuspensionWarning": false,
    "enableOrganizationSettings": true,
    "enableLanePolicies": true,
    "enableLaneSubscription": true,
    "enableCardHistory": true,
    "enableWipLimit": true,
    "enableUserGuides": false,
    "allowEnterpriseOneIntegration": false,
    "enablePlanviewIntegration": false,
    "isSslEnabled": true,
    "allowAllTemplates": true,
    "allowBoardCreationFromTemplates": true,
    "allowHorizontalSplitInBoardEdit": true,
    "enableGlobalSearch": true,
    "enableSearch": true,
    "enableFilters": true,
    "enableActivityStream": true,
    "allowComments": true,
    "subscribeUsersToAssignedCardsByDefault": true,
    "allowAttachments": true,
    "enableInvitationSystem": true,
    "allowInvitationsFromAllUsers": false,
    "allowMultiUserAssignments": true,
    "enableImportCards": true,
    "enableExportCards": true,
    "enableExportBoardHistory": true,
    "allowBoardTemplatesCreate": true,
    "enableTaskBoards": true,
    "enableSelectAllUsers": true,
    "enableUserAdminReports": true,
    "classOfServiceEnabled": true,
    "enableCustomCardFields": true,
    "externalCardIdEnabled": true,
    "allowBoardCloning": true,
    "enableDrillThroughBoards": true,
    "enableMultipleDrillThroughBoards": true,
    "allowBoardTemplatesImportExport": true,
    "allowRepliableNotifications": true,
    "allowMoveCardsBetweenBoards": true,
    "allowCardsInBoardTemplates": true,
    "enableSharedBoards": true,
    "allowedSharedBoardRoles": 6,
    "omitSharedBoardReaders": false,
    "enableCustomBoardUrls": true,
    "enableAdvancedSecurity": true,
    "enableUserDevice": false,
    "enableBoardCreatorRole": true,
    "allowTaskboardCategoryEdit": false,
    "allowTaskTypeFiltering": true,
    "allowSeparateCardAndTaskTypes": true,
    "allowAddCardTypes": true,
    "enableTagManagement": true,
    "enableCardDelegation": false,
    "enableConnectedCardsGallery": true,
    "enableUserProvisioningApi": true,
    "enableMyCards": false,
    "enableSavedFilters": true,
    "enableAdvancedRoleSecurity": true,
    "enableSingleSignOn": false,
    "enableCustomerContinueBypass": false,
    "enableSupportSsoBypass": false,
    "enableProcessControlDiagram": true,
    "enableCumulativeFlowDiagram": true,
    "enableCardDistributionDiagram": true,
    "enableEfficiencyDiagram": true,
    "enableConstraintLogReport": false,
    "enablePlannedPercentCompleteReport": true,
    "enableBurndownDiagram": true,
    "enableReworkReport": false,
    "enableExceptionReport": true,
    "enableAssignedUsersReport": true,
    "enableOrgExceptionsDiagram": true,
    "enableReportForecast": false,
    "enableReportExceptionsWeb": true,
    "enableReportTimeline": true,
    "enableReportTimelineLegacy": false,
    "enableReportTimelineActualDate": true,
    "enableCardHistoryHealthTab": true,
    "enableReportingApiCardExport": true,
    "enableReportingApiCardLaneHistory": true,
    "enableReportingApiCurrentUserAssignments": true,
    "enableReportingApiHistoricalUserAssignments": true,
    "enableReportingApiLanes": true,
    "enableReportingApiTags": true,
    "enableReportingApiTasks": true,
    "enableReportingApiConnections": true,
    "enableReportingApiTaskLanes": false,
    "enableReportingApiCustomFields": true,
    "enableReportingApiBlockedHistory": true,
    "enableReportingApiComments": true,
    "organizationId": "3310114062029",
    "title": "Kanbanomation / LeanKitForScaledTeams",
    "hostname": "testy-scaled",
    "expiresOn": null,
    "enablePlanviewIntegrationForE1": false,
    "enablePlanviewIntegrationForPPMP": false,
    "enablePlanviewIntegrationMultipleInstances": false,
    "salesforceId": null,
    "enablePlanviewId": false,
    "samlValidateInResponseTo": false,
    "samlResponseUrl": null,
    "owner": {
        "id": "3310114062030",
        "emailAddress": "test_admin@leankit.com",
        "firstName": "Admin",
        "lastName": "User"
    },
    "accountType": "leanKitForScaledTeams",
    "paymentPeriod": "yearly",
    "accountStatus": "active",
    "defaultRole": "boardAdministrator",
    "customerType": "standard",
    "platformServicesOptInConfirmed": false,
    "platformServicesOptInRequired": true,
    "enableOKRs": true,
    "enableIpFilter": true,
    "ipFilterReportOnlyMode": true,
    "allowedIpRanges": "192.168.1.1/24\n192.168.2.1/24"
}
```
---
title: Update an account delete assignment
public: false
repo: core-account-service
---
# PATCH /io/admin/accountDelete/:accountId
Update an account delete assignment.

_Requires system administrator access._

### Request Properties
|Param|Type|Usage|
|---|---|---|
|`deleteByDate`|string|Date/time, used for prioritizing assignments and potentially alerting of "overdue" assignments|
|`status`|string|Assignment status: "hold" or "not started" (latter is effectively "remove hold")|
|`waitUntilDate`|string|Worker will not pick up assignment until this date/time is reached|

### Sample Request
At least one of the available properties below must be included in the request body.
```json
{
    "deleteByDate": "2035-01-01T00:00:00+00:00",
    "status": "hold",
    "waitUntilDate": "2034-01-01T00:00:00+00:00"
}
```

### Example Response
```json
{
    "organizationId": "1234567",
    "accountId": "2345678",
    "status": "hold",
    "createDate": "2020-10-10T12:13:14.156Z",
    "waitUntilDate": "2034-01-01T00:00:00.000Z",
    "deleteByDate": "2035-01-01T00:00:00.000Z"
}
---
public: false
title: Get a list of users in any organization
repo: core-account-service
---
# GET /io/admin/account/:accountId/user
Returns a paginated list of users in any organization.

_Requires system administrator access._

### Query Params
|Param|Type|Usage|Default|
|-----|-----|------|-------|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|25|
|`sortBy`|enumeration|Set the ordering of the results|lastName|
|`search`|string|Keyword search for by user name and email address||

Valid `sortBy` options:
* newUsers
* enabled
* disabled
* firstNameDesc
* firstNameAsc
* licenseTypeAsc
* licenseTypeDesc
* lastName

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/admin/account/0000/user?limit=10&offset=50' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "pageMeta": {
        "totalRecords": 99,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 25
    },
    "users": [
        {
            "id": "25012",
            "fullName": "User One",
            "emailAddress": "user1@mycompany.com",
            "enabled": true,
            "licenseType": "full",
            "requestsPerWindow": -1
        },
        {
            "id": "25013",
            "fullName": "User Two",
            "emailAddress": "user2@mycompany.com",
            "enabled": true,
            "licenseType": "full",
            "requestsPerWindow": -1
        }
    ]
}
```

### User Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`fullName`|string||
|`emailAddress`|string||
|`enabled`|boolean||
|`licenseType`|string|`full`, `reader`, or `focused`|
|`requestsPerWindow`|integer||
---
public: false
title: Update a user
repo: core-account-service
---
# PATCH /io/admin/account/:accountId/user/:userId
Returns a user in an organization.

_Requires system administrator access._

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `requestsPerWindow` |integer| Number of requests per time window that the user can make |Defaults to `-1` which will use default rate limit values. Setting to `0` will block the user immediately.|

### Example Request
```json
{
  "requestsPerWindow": 10
}
```

### Example Successful Response

200 Success

```json
{
    "id": "25012",
    "fullName": "User One",
    "emailAddress": "user1@mycompany.com",
    "enabled": true,
    "licenseType": "full",
    "requestsPerWindow": 10
}
```

### User Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`fullName`|string||
|`emailAddress`|string||
|`enabled`|boolean||
|`licenseType`|string|`full`, `reader`, or `focused`|
|`requestsPerWindow`|integer||
---
public: false
title: Get details about a specific account type
repo: core-account-service
---
# GET /io/admin/accountType/:accountType
Returns a list of defaults for an account type

_Requires system administrator access._

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/admin/accountType/leanKitForScaledTeams' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "allowAddCardTypes": true,
    "allowAllTemplates": true,
    "allowAttachments": true,
    "allowBoardCloning": true,
    "allowBoardCreationFromTemplates": true,
    ...
    "trialLengthInDays": 30,
    "userLimit": 0
}
```
---
public: false
title: Get info for a list user ids
repo: core-account-service
---
# POST /io/admin/user/info
Returns basic info about a list of users

_Requires system administrator access._

### Request Properties
|Param|Type|Usage|
|-----|-----|-------|
|`userIds`|string[]|List of userIds to return. Maximum of 100||

### Example Successful Response

200 Success

```json
{
  "users": [
    {
      "id": "25012",
      "firstName": "User",
      "lastName": "One",
      "emailAddress": "user1@mycompany.com",
      "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25",
      "organization": {
        "id": "10101",
        "title": "My Org",
        "hostname": "myorg",
        "accountId": "20202"
      }
    }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`firstName`|string||
|`lastName`|string||
|`emailAddress`|string||
|`avatar`|string||
|`organization.id`|string id||
|`organization.title`|string||
|`organization.hostname`|string||
|`organization.accountId`|string id||
---
public: false
title: Get users with explicit rate limits within an account
repo: core-account-service
---
# GET /io/admin/user/rateLimit
Returns basic info about a list of users who have explicit rate limits set

_Requires system administrator access._

### Example Successful Response

200 Success

```json
{
  "users": [
    {
      "id": "25012",
      "firstName": "User",
      "lastName": "One",
      "emailAddress": "user1@mycompany.com",
      "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25",
      "organization": {
        "id": "10101",
        "title": "My Org",
        "hostname": "myorg",
        "accountId": "20202"
      },
      "requestsPerWindow": 10
    }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`firstName`|string||
|`lastName`|string||
|`emailAddress`|string||
|`avatar`|string||
|`organization.id`|string id||
|`organization.title`|string||
|`organization.hostname`|string||
|`organization.accountId`|string id||
|`requestsPerWindow`|int||
---
title: Create an attachment
public: true
repo: core-leankit-api
---
# POST /io/card/:cardId/attachment
Create an attachment.

### Example Request
The payload is a `multipart/form-data` payload with a `description` and `file`.
```
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Length: 354

------WebKitFormBoundary7MA4YWxkTrZu0gW--,
Content-Disposition: form-data; name="description"

This is the description
------WebKitFormBoundary7MA4YWxkTrZu0gW--
Content-Disposition: form-data; name="file"; filename="sample.txt"
Content-Type: application/octet-stream

This is just a test doc.
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```
### Example Successful Response
201 Created

```json
{
    "id": "947451120",
    "attachmentSize": 13,
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "changedBy": null,
    "createdOn": "2019-12-11T21:00:34Z",
    "updatedOn": "2019-12-11T21:00:34Z",
    "description": "This is the description",
    "name": "sample.txt",
    "storageId": "XXXXXXX-XXXX-XXXX-XXXX-XXXXXXX"
}
```

---
title: Delete an attachment
public: true
repo: core-leankit-api
---
# DELETE /io/card/:cardId/attachment/:attachmentId
Delete an attachment.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/card/943206946/attachment/943867019 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get an attachment's contents
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/attachment/:attachmentId/content
Get an attachment's contents.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/attachment/947451120/content \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 OK
```
(attachment contents)
```
---
title: Get a list of attachments for a card
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/attachment
Get a list of attachments for a card.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/attachment \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "attachments": [
        {
            "id": "943867019",
            "createdOn": "2019-12-04T20:37:23Z",
            "createdBy": {
                "id": "478440842",
                "emailAddress": "user@leankit.com",
                "fullName": "First Last",
                "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
            },
            "text": "<p>This is a sample attachment</p>"
        }
    ]
}
```
---
title: Get a list of audits for the recent runs of an automation
public: true
repo: automation-service
---
# GET /io/board/:boardId/automation/:automationId/audit
Get a list of audits for the recent runs (last 20) of an automation.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/1234/automation/5678/audit \
  -H 'Authorization: Basic base64encodedauthhere'
```

Values for `status` field:

1. Success
2. Failure
3. Blocked (From rate limiting or causing a circular loop of automations)

### Example Successful Response

200 Success
```json
{
    "cardAutomationAudits": [
        {
            "id": "8087777",
            "cardAutomationId": "8081717",
            "cardId": "8081415",
            "startTime": "2023-02-07T21:21:29.820Z",
            "endTime": "2023-02-07T21:21:30.067Z",
            "status": 1,
            "result": ""
        },
        {
            "id": "8089404",
            "cardAutomationId": "8080606",
            "cardId": "8081415",
            "startTime": "2023-02-14T13:36:14.993Z",
            "endTime": "2023-02-14T13:36:15.007Z",
            "status": 2,
            "result": "{\"code\":\"post.webhook\",\"data\":{\"message\":\"getaddrinfo ENOTFOUND badwebhook.site\"}}"
        },
        {
            "id": "8089410",
            "cardAutomationId": "8089394",
            "cardId": "8088890",
            "startTime": "2023-02-14T13:36:35.510Z",
            "endTime": "2023-02-14T13:36:35.510Z",
            "status": 3,
            "result": "{\"code\":\"blocked.looping\",\"data\":{\"cardId\":\"8088890\"},\"message\":\"Stopping potential automation loop for cardId: 8088890 and organizationId: 100\"}"
        }
    ]
}
```
---
title: Create a card automation
public: true
repo: automation-service
---
# POST /io/board/:boardId/automation
Create a card automation.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
|`actionType`*|integer|List of action type values<br />`1` (Web service call) <br /> `2` (Post to Slack) <br /> `3` (Post to Microsoft Teams) <br /> `4` (Copy Card) <br /> `5` (Move Card) <br /> `6` (Trigger GitHub Action) <br /> `7` (Update Card) <br /> `8` (Send Email) <br /> `9` (Manage Connections) <br /> `10` (Delete Card) <br /> `11` (Copy Fields)||
|`description`*|string|A description or name for the card automation||
|`enabled`*|boolean|Is the card automation currently active||
|`configuration`*|object|Configuration object describing the automation||
|`configuration.cardTypes`|string array|Filter cards on this list of card type ids||
|`configuration.customIcons`|string array|Filter cards on this list of custom icon (class of service) ids||
|`configuration.lanes`|string array|Filter cards on this list of lane ids||
|`configuration.priorities`|enumeration array|Filter cards on this list of priorities. Possible values are <br /> `normal` <br /> `low` <br /> `high` <br />` critical`||
|`configuration.tags`|string array|List of tags to filter cards||
|`configuration.tagsMode`|enumeration|Mode for matching a card's tags against the specified tags. Possible values are <br /> `anyTag` <br /> `allTags` <br /> `noTags`||
|`configuration.assignees`|string array|List of assigned users to filter cards||
|`configuration.teamAssignees`|string array|List of assigned teams to filter cards||
|`configuration.assigneesMode`|enumeration|Mode for matching a card's assigned members (users or teams) against the specified members. Possible values are <br /> `anyAssignee` <br /> `allAssignees` <br /> `noAssignees`||
|`configuration.isBlocked`|boolean or null|Filter cards on block status||
|`configuration.dateFilter`|object|Filter that allows identifying cards based on their Last Activity date, Last Move date, Planned Start Date, or Planned Finish Date||
|`configuration.dateFilter.field`|enumeration|Filter on a card date. Possible values are <br /> `none` <br /> `lastActivity` <br /> `lastMove` <br /> `plannedStartDate` <br /> `plannedFinishDate`||
|`configuration.dateFilter.comparison`|enumeration|How to compare the card's date with the current date when an automation is being evaluated. The `isEmpty` value does not apply to `lastActivity` or `lastMove` as they will always have a value. Possible values are <br /> `greaterThan` <br /> `lessThen` <br /> `equalTo` <br /> `isEmpty` <br /> `plannedFinishDate`||
|`configuration.dateFilter.direction`|enumeration|How to apply the comparision. The `daysAfterNow` value does not apply to `lastActivity` or `lastMove`, as those dates will always be in the past. Possible values are <br /> `daysBeforeNow` <br /> `daysAfterNow`||
|`configuration.dateFilter.value`|integer|The number of days to use in the comparison||
|`configuration.dateFilter.olsonTimeZone`|string|One of [valid timezones](/markdown/01-overview/time-zones.md).||
|`configuration.events`*|enumeration array|A list of events that should trigger this automation to be evaluated against matching cards. Possible values are <br /> `movedTo` <br /> `movedFrom` <br /> `blocked` <br /> `unblocked` <br /> `create` <br /> `delete` <br /> `childrenComplete` <br /> `firstChildStarted` <br /> `childrenUnblocked` <br /> `childBlocked` <br /> `update` <br /> `scheduled` <br /> `childConnectionAdded` <br /> `childConnectionRemoved` <br /> `parentConnectionAdded` <br /> `parentConnectionRemoved` <br /> `firstTaskStarted` <br />`allTasksCompleted` <br /> `commentAdded` <br /> `custom`||
|`configuration.customEvents`|string array|When `custom` is selected as an event type, then this is a list of custom event names that will match this automation.||
|`configuration.allowBoardLevelCustomEvent`|boolean|When `custom` is selected as an event type, then this value determines whether the automation can run at a board level (rather than only specific to a single card).||
|`configuration.updateFields`|enumeration array|An `update` event will only be triggered when at least one of the listed fields is updated. An empty value indicates that the event will be triggered when any field is updated. Possible values are <br /> `tags` <br /> `assignedMembers` <br /> `size` <br /> `cardType` <br /> `planningIncrements` <br /> `plannedStart` <br /> `plannedFinish` <br /> `cardHeader` <br /> `priority` <br /> `customIcon` <br /> `title` <br /> `description` <br /> `externalUrl` <br /> `attachments` <br /> `cardScore` <br /> `comments`||
|`configuration.schedule`|object|Scheduling information for when `scheduled` is one of the triggering events||
|`configuration.schedule.timeOfDayUtc`|string|The time of day in UTC. Example `09:05`.||
|`configuration.schedule.daysOfTheWeek`|string array|The days of the week that this scheduled automation should run. Possible values are <br /> `sunday` <br /> `monday` <br /> `tuesday` <br /> `wednesday` <br /> `thursday` <br /> `friday` <br /> `saturday`||
|`configuration.schedule.recurrenceType`|string|Either `weekly` or `monthly` for when the scheduled automation runs||
|`configuration.schedule.monthlySchedule`|object|Monthly scheduling information for when `recurrenceType` is `monthly`||
|`configuration.schedule.monthlySchedule.type`|string|Either `dayOfWeek` (e.g. 3rd Tuesday of the month) or `specificDate` (e.g. 15th of the month) for the type of monthly schedule ||
|`configuration.schedule.monthlySchedule.weekOfMonth`|string|When the `type` is ` dayOfWeek`, this determines the week option. Possible values are <br /> `first` <br /> `second` <br /> `third` <br /> `fourth` <br /> `last` ||
|`configuration.schedule.monthlySchedule.dayOfWeek`|string|When the `type` is ` dayOfWeek`, this determines the day of the week for running the scheduled automation. Possible values are <br /> `sunday` <br /> `monday` <br /> `tuesday` <br /> `wednesday` <br /> `thursday` <br /> `friday` <br /> `saturday` <br /> `sunday` ||
|`configuration.schedule.monthlySchedule.dayOfMonth`|string|A numeric value between -1 and 31 for when `type` is `specificDate`. The value `-1` represents the last day of the month. The value `0` or `1` represents the first day of the month.||
|`configuration.action`*|object|Details about the action to run when an the automation is triggered for a card||
|`configuration.action.url (Web Service Call)`|string|The URL destination for a web service call||
|`configuration.action.contentType (Web Service Call)`|enumeration|The content type to use as part of the request. Possible values are <br /> `application/json` <br/> `application/x-www-form-urlencoded` ||
|`configuration.action.url (Post to Slack)`|string|The Slack incoming webhook URL||
|`configuration.action.messagePrefix (Post to Slack)`|string|A heading to include in the message||
|`configuration.action.includeDescription (Post to Slack)`|boolean|Determines if the card description is included in the message||
|`configuration.action.url (Post to Teams)`|string|The Microsoft Teams incoming webhook URL||
|`configuration.action.messagePrefix (Post to Teams)`|string|A heading to include in the message||
|`configuration.action.includeDescription (Post to Teams)`|boolean|Determines if the card description is included in the message||
|`configuration.action.destinationBoardId (Copy Card)`|string|Create the copied card on this board id||
|`configuration.action.destinationLaneId (Copy Card)`|string|Create the copied card in this lane||
|`configuration.action.createConnectionOption (Copy Card)`|enumeration|Connection options for the copied card. Possible values are <br /> `none` <br /> `child` (create the copied card as a child of the original) <br /> `parent` (create the copied card as a parent of the original)||
|`configuration.action.destinationBoardId (Move Card)`|string|Move the card to this board id||
|`configuration.action.destinationLaneId (Move Card)`|string|Move the card to this lane||
|`configuration.action.priority (Update Card)`|enumeration or null|A priority to set on the card. Possible values are <br /> `normal` <br /> `low` <br /> `high` <br />` critical`. Specify `null` for no change.||
|`configuration.action.cardType (Update Card)`|string or null|Update the card to this card type id. Specify `null` for no change.||
|`configuration.action.customIcon (Update Card)`|string or null|Update the card with this custom icon id. Specify `null` for no change.||
|`configuration.action.isBlocked (Update Card)`|boolean or null|Update the card to this block status. Specify `null` for no change.||
|`configuration.action.blockReason (Update Card)`|string or null|When blocking or unblocking a card use this block reason.|"Blocked by Card Automation"|
|`configuration.action.tagsToAdd (Update Card)`|string array|Add this list of tags to the card||
|`configuration.action.tagsToRemove (Update Card)`|string array|Remove this list of tags from the card (if any of the tags are already on the card)||
|`configuration.action.usersToAssign (Update Card)`|string array|Assign this list of user ids to the card||
|`configuration.action.teamsToAssign (Update Card)`|string array|Assign this list of team ids to the card||
|`configuration.action.membersToAssignMode (Update Card)`|enumeration|Possible values are <br /> `selectedMembers` <br /> `childCardAssignees`.||
|`configuration.action.usersToUnassign (Update Card)`|string array|Unassign this list of user ids from the card (if any of the users are assigned)||
|`configuration.action.teamsToUnassign (Update Card)`|string array|Unassign this list of team ids from the card (if any of the teams are assigned)||
|`configuration.action.membersToUnassignMode (Update Card)`|enumeration|Possible values are <br /> `selectedMembers` <br /> `allAssignees`.||
|`configuration.action.customFields (Update Card)`|object array|Array of custom field objects in the format `{ "fieldId": "1234", "value": "myvalue" }`. Value can be `null`, a string, a number, or an array of strings (multi field) depending on the field type.||
|`configuration.action.plannedStart (Update Card)`|object or null|Update the plannedStart field.||
|`configuration.action.plannedStart.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `relative` <br /> `earliestChildCardDate` <br />` latestChildCardDate` <br /> ` earliestPlanningIncrementStartDate` <br /> ` latestPlanningIncrementEndDate`.||
|`configuration.action.plannedStart.unit (Update Card)`|enumeration|When mode is `relative`, select the unit from choices <br /> `day` <br /> `week` <br /> `month`.||
|`configuration.action.plannedStart.value (Update Card)`|number|When mode is `relative`, select the value to add to the current date in the units selected when the automation runs. Values between -999 and 999 are supported.||
|`configuration.action.plannedStart.olsonTimeZone (Update Card)`|string or null|Provide a time zone to determine the current date when the automation runs to use in calculations.||
|`configuration.action.plannedFinish (Update Card)`|object or null|Update the plannedFinish field.||
|`configuration.action.plannedFinish.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `relative` <br /> `earliestChildCardDate` <br />` latestChildCardDate` <br /> ` earliestPlanningIncrementStartDate` <br /> ` latestPlanningIncrementEndDate`.||
|`configuration.action.plannedFinish.unit (Update Card)`|enumeration|When mode is `relative`, select the unit from choices <br /> `day` <br /> `week` <br /> `month`.||
|`configuration.action.plannedFinish.value (Update Card)`|number|When mode is `relative`, select the value to add to the current date in the units selected when the automation runs. Values between -999 and 999 are supported.||
|`configuration.action.plannedFinish.olsonTimeZone (Update Card)`|string or null|Provide a time zone to determine the current date when the automation runs to use in calculations.||
|`configuration.action.size (Update Card)`|object or null|Update the size field.||
|`configuration.action.size.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `specificValue` <br /> `sumOfChildren`.||
|`configuration.action.size.value (Update Card)`|number|When mode is `specificValue`, select the value to use for size when the automation runs. Values between 1 and 999999999 are supported.||
|`configuration.action.owner.value (GitHub Action)`|string|The GitHub repository owner name, if not using a custom field||
|`configuration.action.owner.customFieldId (GitHub Action)`|string|The id of a card custom field that contains the GitHub repository owner, when `useCustomField` is true||
|`configuration.action.owner.useCustomField (GitHub Action)`|boolean|Whether to use a custom field on the card to determine the GitHub repository owner||
|`configuration.action.repo.value (GitHub Action)`|string|The GitHub repository name, if not using a custom field||
|`configuration.action.repo.customFieldId (GitHub Action)`|string|The id of a card custom field that contains the GitHub repository name, when `useCustomField` is true||
|`configuration.action.repo.useCustomField (GitHub Action)`|boolean|Whether to use a custom field on the card to determine the GitHub repository owner||
|`configuration.action.eventType (GitHub Action)`|string|The `event_type` value to provide to GitHub, which enables differentiating which action to run||
|`configuration.action.includeDescription (Email Action)`|boolean|Determines if the card description is included in the email||
|`configuration.action.subject (Email Action)`|string|The subject of the email
|`configuration.action.comment (Email Action)`|string|A message to include as part of the body of the email
|`configuration.action.recipientSource (Email Action)`|enumeration|Mode for determining users to send a triggered email. Possible values are <br /> `assigned` <br /> `selected`.||
|`configuration.action.recipientIds (Email Action)`|string array|When the `recipientSource` is `selected`, this field specifies a list of user ids to use when triggering emails.||
|`configuration.action.updateType (Manage Connections)`|enumeration|The only accepted value at this time is `remove`.||
|`configuration.action.removalMode (Manage Connections)`|enumeration|Which connections to remove on the card. Possible values are <br /> `none` <br /> `all` <br /> `parents` <br /> `children`.||
|`configuration.action.mode (Copy Fields)`|enumeration|Mode to determine where the direction that fields are copied. Possible values are <br /> `fromParent` <br /> `fromChild` <br /> `toParents` <br /> `toChildren`.||
|`configuration.action.fieldsToCopy (Copy Fields)`|enumeration|Which fields are actually copied. Possible values are <br /> `title` <br /> `description` <br /> `size` <br /> `priority` <br /> `customIcon` <br /> `cardType` <br /> `tags` <br /> `assignedUsers` <br /> `assignedTeams` <br /> `plannedStart` <br /> `plannedFinish` <br /> `blockedStatus` <br /> `customId` <br /> `externalLink` <br /> `planningIncrements`.||
|`configuration.action.customFieldsToCopy (Copy Fields)`|string array|List of custom field ids (on this board) to be copied.||
|`configuration.action.overwriteWithEmptyValue (Copy Fields)`|boolean|Whether an empty value on the source should overwrite the destination, when supported.||
|`configuration.action.eventName (Initiate Custom Event)`|string|The name of the custom event||
|`configuration.action.mode (Initiate Custom Event)`|enumeration|Whether to initiate the custom event for the parents of children of the card that triggered the automation. Possible values are <br /> `parents` <br /> `children`.||
|`secrets`|object|Contains secret information being provided for an action.||
|`secrets.github`|string|GitHub access token to associate with a GitHub Action automation||
|`secrets.signingKey`|string|Key to use as part of signing the body for the `x-lk-signature` header on a Web Service Call automation||

\* Required

### Example Request

```json
{
    "actionType": 2,
    "description": "Notify on Blocked Cards",
    "enabled": true,
    "configuration": {
        "cardTypes": [
            "10112910837",
            "10112910838",
            "10112910840"
        ],
        "customIcons": [
            "10112910937"
        ],
        "lanes": [
            "10112910647",
            "10112910648"
        ],
        "priorities": [],
        "tags": [ "tagOne", "tagTwo" ],
        "tagsMode": "allTags",
        "assignees": [ "10112710349" ],
        "teamAssignees": [ "10114432333"],
        "assigneesMode": "anyAssignee",
        "isBlocked": true,
        "events": [
            "scheduled"
        ],
        "action": {
            "url": "https://my-incoming-slack-url.com",
            "messagePrefix": "**Blocked Card**",
            "includeDescription": true
        },
        "schedule": {
            "timeOfDayUtc": "14:00",
            "daysOfTheWeek": [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday"
            ]
        }
    }
}
```

### Example Successful Response
201 Created

```json
{
    "cardAutomation": {
        "id": "10135649061",
        "boardId": "10112910528",
        "userId": "25038",
        "description": "Notify on Blocked Cards",
        "enabled": true,
        "events": [
            "scheduled"
        ],
        "schedule": {
            "timeOfDayUtc": "14:00",
            "daysOfTheWeek": [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday"
            ]
        },
        "filter": {
            "cardTypes": [
                "10112910837",
                "10112910838",
                "10112910840"
            ],
            "customIcons": [
                "10112910937"
            ],
            "lanes": [
                "10112910647",
                "10112910648"
            ],
            "priorities": [],
            "tags": [ "tagOne", "tagTwo" ],
            "tagsMode": "allTags",
            "assignees": [ "10112710349" ],
            "teamAssignees": [ "10114432333"],
            "assigneesMode": "anyAssignee",
            "isBlocked": true
        },
        "action": {
            "type": "postToSlack",
            "params": {
                "url": "https://my-incoming-slack-url.com",
                "messagePrefix": "**Blocked Card**",
                "includeDescription": true
            }
        },
        "hasSecrets": false
    }
}
```

---
title: Delete a card automation
public: true
repo: automation-service
---
# DELETE /io/board/:boardId/automation/:automationId
Delete a card automation.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/1234/automation/5678 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get a specified card automation
public: true
repo: automation-service
---
# GET /io/board/:boardId/automation/:automationId
Get an automation by id.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/1234/automation/5678 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example successful response
```shell
200 OK
{
    "cardAutomation": {
        "id": "7795679304",
        "boardId": "917601939",
        "userId": "902179392",
        "description": "Post to Slack when a Card is ready for testing",
        "enabled": true,
        "events": [
            "movedTo"
        ],
        "filter": {
            "cardTypes": [],
            "lanes": [
                "918189498"
            ],
            "priorities": [],
            "tags": []
        },
        "action": {
            "type": "postToSlack",
            "params": {
                "url": "https://my-incoming-slack-url",
                "messagePrefix": "Ready for testing",
                "includeDescription": false
            }
        },
        "hasSecrets": false
    }
}
```
---
title: Initiate a board-level custom event
public: true
repo: automation-service
---
# POST /io/board/:boardId/automation/customevent
Trigger a custom event for a board. This allows you to execute automations based on something happening outside of your board. For a board-level custom event, the criteria on the automation is used to identify matching cards (this is similar to how scheduled automations run) and the automation is run for each matching card (up to 1000). Board-level custom events are subject to more aggressive rate limiting, as they can result in creating significant activity. This limit is set to 5 per event in 5 minutes.

If using GitHub Actions, AgilePlace has a standard action to initiate a board-level custom events. Please see: https://github.com/LeanKit/github-actions?tab=readme-ov-file#initiate-board-event along with https://github.com/LeanKit/github-actions?tab=readme-ov-file#extract-card-id.

### Example Request
```shell
curl -X POST \
  https://myaccount.leankit.com/io/board/1234/automation/customevent \
  -H 'Authorization: Basic base64encodedauthhere' \
  --data `{ "eventName": "release-created" }`
```

### Example Successful Response

202 Accepted

---
title: Initiate a card-level custom event
public: true
repo: automation-service
---
# POST /io/card/:cardId/automation/customevent
Triggering custom events from this API, allows you to execute automations based on something happening outside of your board. For a card-level custom event, any automations that have the `custom` event type and match the event name will be executed, as long as all of the other criteria on the automation match the card as well.

If using GitHub Actions, AgilePlace has a standard action to initiate an card-level custom event. Please review: https://github.com/LeanKit/github-actions?tab=readme-ov-file#initiate-card-event along with https://github.com/LeanKit/github-actions?tab=readme-ov-file#extract-card-id.
.

### Example Request
```shell
curl -X POST \
  https://myaccount.leankit.com/io/card/1234/automation/customevent \
  -H 'Authorization: Basic base64encodedauthhere' \
  --data `{ "eventName": "pr-merged" }`
```

### Example Successful Response

202 Accepted
---
title: Get the list of card automations for a board
public: true
repo: automation-service
---
# GET /io/board/:boardId/automation
Get the list of card automations for a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/1234/automation \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "cardAutomations": [
        {
            "id": "7795679304",
            "boardId": "917601939",
            "userId": "902179392",
            "description": "Post to Slack when a Card is ready for testing",
            "enabled": true,
            "events": [
                "movedTo"
            ],
            "filter": {
                "cardTypes": [],
                "lanes": [
                    "918189498"
                ],
                "priorities": [],
                "tags": []
            },
            "action": {
                "type": "postToSlack",
                "params": {
                    "url": "https://my-incoming-slack-url",
                    "messagePrefix": "Ready for testing",
                    "includeDescription": false
                }
            },
            "hasSecrets": false,
            "latestStatus": 1,
            "latestStatusTime": "2023-02-13T20:38:14.883Z"
        },
        {
            "id": "7870054303",
            "userId": "902167085",
            "boardId": "917601939",
            "actionType": 2,
            "description": "Ping QE if in Ready to test for more than a day",
            "enabled": true,
            "configuration": {
                "events": [
                    "scheduled"
                ],
                "schedule": {
                    "timeOfDayUtc": "15:00",
                    "daysOfTheWeek": [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday"
                    ]
                },
                "cardTypes": [],
                "lanes": [
                    "918189498"
                ],
                "priorities": [],
                "tags": [],
                "action": {
                    "url": "https://my-incoming-slack-url",
                    "messagePrefix": "****This Card has been waiting on TESTING for more than 1 day***",
                    "includeDescription": false
                },
                "dateFilter": {
                    "field": "lastActivity",
                    "comparison": "greaterThan",
                    "value": 1,
                    "direction": "daysBeforeNow",
                    "olsonTimeZone": "America/Chicago"
                }
            },
            "hasSecrets": false,
            "latestStatus": 1,
            "latestStatusTime": "2023-02-13T15:00:01.170Z"
        }
    ]
}
```
---
title: Update a card automation
public: true
repo: automation-service
---
# PATCH /io/board/:boardId/automation/:automationId
Update a card automation.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
|`actionType`*|integer|List of action type values<br />`1` (Web service call) <br /> `2` (Post to Slack) <br /> `3` (Post to Microsoft Teams) <br /> `4` (Copy Card) <br /> `5` (Move Card) <br /> `6` (Trigger GitHub Action) <br /> `7` (Update Card) <br /> `8` (Send Email) <br /> `9` (Manage Connections) <br /> `10` (Delete Card) <br /> `11` (Copy Fields)||
|`description`*|string|A description or name for the card automation||
|`enabled`*|boolean|Is the card automation currently active||
|`configuration`*|object|Configuration object describing the automation||
|`configuration.cardTypes`|string array|Filter cards on this list of card type ids||
|`configuration.customIcons`|string array|Filter cards on this list of custom icon (class of service) ids||
|`configuration.lanes`|string array|Filter cards on this list of lane ids||
|`configuration.priorities`|enumeration array|Filter cards on this list of priorities. Possible values are <br /> `normal` <br /> `low` <br /> `high` <br />` critical`||
|`configuration.tags`|string array|List of tags to filter cards||
|`configuration.tagsMode`|enumeration|Mode for matching a card's tags against the specified tags. Possible values are <br /> `anyTag` <br /> `allTags` <br /> `noTags`||
|`configuration.assignees`|string array|List of assigned users to filter cards||
|`configuration.teamAssignees`|string array|List of assigned teams to filter cards||
|`configuration.assigneesMode`|enumeration|Mode for matching a card's assigned members (users or teams) against the specified members. Possible values are <br /> `anyAssignee` <br /> `allAssignees` <br /> `noAssignees`||
|`configuration.isBlocked`|boolean or null|Filter cards on block status||
|`configuration.dateFilter`|object|Filter that allows identifying cards based on their Last Activity date, Last Move date, Planned Start Date, or Planned Finish Date||
|`configuration.dateFilter.field`|enumeration|Filter on a card date. Possible values are <br /> `none` <br /> `lastActivity` <br /> `lastMove` <br /> `plannedStartDate` <br /> `plannedFinishDate`||
|`configuration.dateFilter.comparison`|enumeration|How to compare the card's date with the current date when an automation is being evaluated. The `isEmpty` value does not apply to `lastActivity` or `lastMove` as they will always have a value. Possible values are <br /> `greaterThan` <br /> `lessThen` <br /> `equalTo` <br /> `isEmpty` <br /> `plannedFinishDate`||
|`configuration.dateFilter.direction`|enumeration|How to apply the comparision. The `daysAfterNow` value does not apply to `lastActivity` or `lastMove`, as those dates will always be in the past. Possible values are <br /> `daysBeforeNow` <br /> `daysAfterNow`||
|`configuration.dateFilter.value`|integer|The number of days to use in the comparison||
|`configuration.dateFilter.olsonTimeZone`|string|One of [valid timezones](/markdown/01-overview/time-zones.md).||
|`configuration.events`*|enumeration array|A list of events that should trigger this automation to be evaluated against matching cards. Possible values are <br /> `movedTo` <br /> `movedFrom` <br /> `blocked` <br /> `unblocked` <br /> `create` <br /> `delete` <br /> `childrenComplete` <br /> `firstChildStarted` <br /> `childrenUnblocked` <br /> `childBlocked` <br /> `update` <br /> `scheduled` <br /> `childConnectionAdded` <br /> `childConnectionRemoved` <br /> `parentConnectionAdded` <br /> `parentConnectionRemoved` <br /> `firstTaskStarted` <br />`allTasksCompleted` <br /> `commentAdded` <br /> `custom`||
|`configuration.customEvents`|string array|When `custom` is selected as an event type, then this is a list of custom event names that will match this automation.||
|`configuration.allowBoardLevelCustomEvent`|boolean|When `custom` is selected as an event type, then this value determines whether the automation can run at a board level (rather than only specific to a single card).||
|`configuration.updateFields`|enumeration array|An `update` event will only be triggered when at least one of the listed fields is updated. An empty value indicates that the event will be triggered when any field is updated. Possible values are <br /> `tags` <br /> `assignedMembers` <br /> `size` <br /> `cardType` <br /> `planningIncrements` <br /> `plannedStart` <br /> `plannedFinish` <br /> `cardHeader` <br /> `priority` <br /> `customIcon` <br /> `title` <br /> `description` <br /> `externalUrl` <br /> `attachments` <br /> `cardScore` <br /> `comments`||
|`configuration.schedule`|object|Scheduling information for when `scheduled` is one of the triggering events||
|`configuration.schedule.timeOfDayUtc`|string|The time of day in UTC. Example `09:05`.||
|`configuration.schedule.daysOfTheWeek`|string array|The days of the week that this scheduled automation should run. Possible values are <br /> `sunday` <br /> `monday` <br /> `tuesday` <br /> `wednesday` <br /> `thursday` <br /> `friday` <br /> `saturday`||
|`configuration.schedule.recurrenceType`|string|Either `weekly` or `monthly` for when the scheduled automation runs||
|`configuration.schedule.monthlySchedule`|object|Monthly scheduling information for when `recurrenceType` is `monthly`||
|`configuration.schedule.monthlySchedule.type`|string|Either `dayOfWeek` (e.g. 3rd Tuesday of the month) or `specificDate` (e.g. 15th of the month) for the type of monthly schedule ||
|`configuration.schedule.monthlySchedule.weekOfMonth`|string|When the `type` is ` dayOfWeek`, this determines the week option. Possible values are <br /> `first` <br /> `second` <br /> `third` <br /> `fourth` <br /> `last` ||
|`configuration.schedule.monthlySchedule.dayOfWeek`|string|When the `type` is ` dayOfWeek`, this determines the day of the week for running the scheduled automation. Possible values are <br /> `sunday` <br /> `monday` <br /> `tuesday` <br /> `wednesday` <br /> `thursday` <br /> `friday` <br /> `saturday` <br /> `sunday` ||
|`configuration.schedule.monthlySchedule.dayOfMonth`|string|A numeric value between -1 and 31 for when `type` is `specificDate`. The value `-1` represents the last day of the month. The value `0` or `1` represents the first day of the month.||
|`configuration.action`*|object|Details about the action to run when an the automation is triggered for a card||
|`configuration.action.url (Web Service Call)`|string|The URL destination for a web service call||
|`configuration.action.contentType (Web Service Call)`|enumeration|The content type to use as part of the request. Possible values are <br /> `application/json` <br/> `application/x-www-form-urlencoded` ||
|`configuration.action.url (Post to Slack)`|string|The Slack incoming webhook URL||
|`configuration.action.messagePrefix (Post to Slack)`|string|A heading to include in the message||
|`configuration.action.includeDescription (Post to Slack)`|boolean|Determines if the card description is included in the message||
|`configuration.action.url (Post to Teams)`|string|The Microsoft Teams incoming webhook URL||
|`configuration.action.messagePrefix (Post to Teams)`|string|A heading to include in the message||
|`configuration.action.includeDescription (Post to Teams)`|boolean|Determines if the card description is included in the message||
|`configuration.action.destinationBoardId (Copy Card)`|string|Create the copied card on this board id||
|`configuration.action.destinationLaneId (Copy Card)`|string|Create the copied card in this lane||
|`configuration.action.createConnectionOption (Copy Card)`|enumeration|Connection options for the copied card. Possible values are <br /> `none` <br /> `child` (create the copied card as a child of the original) <br /> `parent` (create the copied card as a parent of the original)||
|`configuration.action.destinationBoardId (Move Card)`|string|Move the card to this board id||
|`configuration.action.destinationLaneId (Move Card)`|string|Move the card to this lane||
|`configuration.action.priority (Update Card)`|enumeration or null|A priority to set on the card. Possible values are <br /> `normal` <br /> `low` <br /> `high` <br />` critical`. Specify `null` for no change.||
|`configuration.action.cardType (Update Card)`|string or null|Update the card to this card type id. Specify `null` for no change.||
|`configuration.action.customIcon (Update Card)`|string or null|Update the card with this custom icon id. Specify `null` for no change.||
|`configuration.action.isBlocked (Update Card)`|boolean or null|Update the card to this block status. Specify `null` for no change.||
|`configuration.action.blockReason (Update Card)`|string or null|When blocking or unblocking a card use this block reason.|"Blocked by Card Automation"|
|`configuration.action.tagsToAdd (Update Card)`|string array|Add this list of tags to the card||
|`configuration.action.tagsToRemove (Update Card)`|string array|Remove this list of tags from the card (if any of the tags are already on the card)||
|`configuration.action.usersToAssign (Update Card)`|string array|Assign this list of user ids to the card||
|`configuration.action.teamsToAssign (Update Card)`|string array|Assign this list of team ids to the card||
|`configuration.action.membersToAssignMode (Update Card)`|enumeration|Possible values are <br /> `selectedMembers` <br /> `childCardAssignees`.||
|`configuration.action.usersToUnassign (Update Card)`|string array|Unassign this list of user ids from the card (if any of the users are assigned)||
|`configuration.action.teamsToUnassign (Update Card)`|string array|Unassign this list of team ids from the card (if any of the teams are assigned)||
|`configuration.action.membersToUnassignMode (Update Card)`|enumeration|Possible values are <br /> `selectedMembers` <br /> `allAssignees`.||
|`configuration.action.customFields (Update Card)`|object array|Array of custom field objects in the format `{ "fieldId": "1234", "value": "myvalue" }`. Value can be `null`, a string, a number, or an array of strings (multi field) depending on the field type.||
|`configuration.action.plannedStart (Update Card)`|object or null|Update the plannedStart field.||
|`configuration.action.plannedStart.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `relative` <br /> `earliestChildCardDate` <br />` latestChildCardDate` <br /> ` earliestPlanningIncrementStartDate` <br /> ` latestPlanningIncrementEndDate`.||
|`configuration.action.plannedStart.unit (Update Card)`|enumeration|When mode is `relative`, select the unit from choices <br /> `day` <br /> `week` <br /> `month`.||
|`configuration.action.plannedStart.value (Update Card)`|number|When mode is `relative`, select the value to add to the current date in the units selected when the automation runs. Values between -999 and 999 are supported.||
|`configuration.action.plannedStart.olsonTimeZone (Update Card)`|string or null|Provide a time zone to determine the current date when the automation runs to use in calculations.||
|`configuration.action.plannedFinish (Update Card)`|object or null|Update the plannedFinish field.||
|`configuration.action.plannedFinish.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `relative` <br /> `earliestChildCardDate` <br />` latestChildCardDate` <br /> ` earliestPlanningIncrementStartDate` <br /> ` latestPlanningIncrementEndDate`.||
|`configuration.action.plannedFinish.unit (Update Card)`|enumeration|When mode is `relative`, select the unit from choices <br /> `day` <br /> `week` <br /> `month`.||
|`configuration.action.plannedFinish.value (Update Card)`|number|When mode is `relative`, select the value to add to the current date in the units selected when the automation runs. Values between -999 and 999 are supported.||
|`configuration.action.plannedFinish.olsonTimeZone (Update Card)`|string or null|Provide a time zone to determine the current date when the automation runs to use in calculations.||
|`configuration.action.size (Update Card)`|object or null|Update the size field.||
|`configuration.action.size.mode (Update Card)`|enumeration|Possible values are <br /> `clear` <br /> `specificValue` <br /> `sumOfChildren`.||
|`configuration.action.size.value (Update Card)`|number|When mode is `specificValue`, select the value to use for size when the automation runs. Values between 1 and 999999999 are supported.||
|`configuration.action.owner.value (GitHub Action)`|string|The GitHub repository owner name, if not using a custom field||
|`configuration.action.owner.customFieldId (GitHub Action)`|string|The id of a card custom field that contains the GitHub repository owner, when `useCustomField` is true||
|`configuration.action.owner.useCustomField (GitHub Action)`|boolean|Whether to use a custom field on the card to determine the GitHub repository owner||
|`configuration.action.repo.value (GitHub Action)`|string|The GitHub repository name, if not using a custom field||
|`configuration.action.repo.customFieldId (GitHub Action)`|string|The id of a card custom field that contains the GitHub repository name, when `useCustomField` is true||
|`configuration.action.repo.useCustomField (GitHub Action)`|boolean|Whether to use a custom field on the card to determine the GitHub repository owner||
|`configuration.action.eventType (GitHub Action)`|string|The `event_type` value to provide to GitHub, which enables differentiating which action to run||
|`configuration.action.includeDescription (Email Action)`|boolean|Determines if the card description is included in the email||
|`configuration.action.subject (Email Action)`|string|The subject of the email
|`configuration.action.comment (Email Action)`|string|A message to include as part of the body of the email
|`configuration.action.recipientSource (Email Action)`|enumeration|Mode for determining users to send a triggered email. Possible values are <br /> `assigned` <br /> `selected`.||
|`configuration.action.recipientIds (Email Action)`|string array|When the `recipientSource` is `selected`, this field specifies a list of user ids to use when triggering emails.||
|`configuration.action.updateType (Manage Connections)`|enumeration|The only accepted value at this time is `remove`.||
|`configuration.action.removalMode (Manage Connections)`|enumeration|Which connections to remove on the card. Possible values are <br /> `none` <br /> `all` <br /> `parents` <br /> `children`.||
|`configuration.action.mode (Copy Fields)`|enumeration|Mode to determine where the direction that fields are copied. Possible values are <br /> `fromParent` <br /> `fromChild` <br /> `toParents` <br /> `toChildren`.||
|`configuration.action.fieldsToCopy (Copy Fields)`|enumeration|Which fields are actually copied. Possible values are <br /> `title` <br /> `description` <br /> `size` <br /> `priority` <br /> `customIcon` <br /> `cardType` <br /> `tags` <br /> `assignedUsers` <br /> `assignedTeams` <br /> `plannedStart` <br /> `plannedFinish` <br /> `blockedStatus` <br /> `customId` <br /> `externalLink` <br /> `planningIncrements`.||
|`configuration.action.customFieldsToCopy (Copy Fields)`|string array|List of custom field ids (on this board) to be copied.||
|`configuration.action.overwriteWithEmptyValue (Copy Fields)`|boolean|Whether an empty value on the source should overwrite the destination, when supported.||
|`configuration.action.eventName (Initiate Custom Event)`|string|The name of the custom event||
|`configuration.action.mode (Initiate Custom Event)`|enumeration|Whether to initiate the custom event for the parents of children of the card that triggered the automation. Possible values are <br /> `parents` <br /> `children`.||
|`secrets`|object|Contains secret information being provided for an action.||
|`secrets.github`|string|GitHub access token to associate with a GitHub Action automation||
|`secrets.signingKey`|string|Key to use as part of signing the body for the `x-lk-signature` header on a Web Service Call automation||
|`updateSecrets`|boolean|Flag to indicate that secrets should be updated for the automation.||

\* Required

### Example Request

```json
{
    "actionType": 2,
    "description": "Notify on Blocked Cards",
    "enabled": true,
    "configuration": {
        "cardTypes": [
            "10112910837",
            "10112910838",
            "10112910840"
        ],
        "customIcons": [
            "10112910937"
        ],
        "lanes": [
            "10112910647",
            "10112910648"
        ],
        "priorities": [],
        "tags": [ "tagOne", "tagTwo" ],
        "tagsMode": "allTags",
        "assignees": [ "10112710349" ],
        "teamAssignees": [ "10114432333"],
        "assigneesMode": "anyAssignee",
        "isBlocked": true,
        "events": [
            "scheduled"
        ],
        "action": {
            "url": "https://my-incoming-slack-url.com",
            "messagePrefix": "**Blocked Card**",
            "includeDescription": true
        },
        "schedule": {
            "timeOfDayUtc": "14:00",
            "daysOfTheWeek": [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday"
            ]
        }
    }
}
```

### Example Successful Response
200 Success

```json
{
    "cardAutomation": {
        "id": "10135649061",
        "boardId": "10112910528",
        "userId": "25038",
        "description": "Notify on Blocked Cards",
        "enabled": true,
        "events": [
            "scheduled"
        ],
        "schedule": {
            "timeOfDayUtc": "14:00",
            "daysOfTheWeek": [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday"
            ]
        },
        "filter": {
            "cardTypes": [
                "10112910837",
                "10112910838",
                "10112910840"
            ],
            "customIcons": [
                "10112910937"
            ],
            "lanes": [
                "10112910647",
                "10112910648"
            ],
            "priorities": [],
            "tags": [ "tagOne", "tagTwo" ],
            "tagsMode": "allTags",
            "assignees": [ "10112710349" ],
            "teamAssignees": [ "10114432333"],
            "assigneesMode": "anyAssignee",
            "isBlocked": true
        },
        "action": {
            "type": "postToSlack",
            "params": {
                "url": "https://my-incoming-slack-url.com",
                "messagePrefix": "**Blocked Card**",
                "includeDescription": true
            }
        },
        "hasSecrets": false
    }
}
```

---
title: Get recent board activity
public: false
repo: core-board-service
---

# GET /io/board/:boardId/activity
Get board activity.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`limit`|integer|Specify the number of events to receive|100|
|`eventId`|string|Support paging of events by specifying the last event id received.|null|
|`direction`|enumeration|Specify `older` posts as you scroll, or `newer`.|`older`|


### Example Requests

#### Defaults
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10100193219/activity' \
  -H 'Authorization: Basic base64encodedauth' \
```

####
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10100193219/activity?limit=25&eventId=457634234&direction=newer' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response
```json
{
    "events": [
        {
            "id": "10113988923",
            "type": "cardMoved",
            "timestamp": "2020-01-08T17:23:01Z",
            "user": {
                "id": "25019",
                "fullName": "John Martin",
                "avatar": "https://myaccount.leankit.com/avatar/show/25109/?s=25"
            },
            "data": {
                "card": {
                    "id": "10113988569",
                    "title": "Test card"
                },
                "fromLane": {
                    "id": "10113988905",
                    "title": "Doing Now: Dev"
                },
                "toLane": {
                    "id": "10113988921",
                    "title": "Doing Now: Review"
                }
            }
        }
    ]
}
```

#### Common Events
This is not a comprehensive list, but a sample of common event data objects.

#### cardCreated
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "lane": {
            "id": "88349234",
            "title": "Not Started - Incoming Requests"
        }
    }
```

#### cardChanged
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "fields": [
            {
                "name": "size",
                "oldValue": "0",
                "newValue": "4"
            },
            {
                "name": "priority",
                "oldValue": "normal",
                "newValue": "high"
            }
        ]
    }
```

#### cardChildConnectionCreated / cardChildConnectionDeleted
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "chilCard": {
            "id": "8675309",
            "title": "child 1"
        }
    }
```

#### cardDeleted
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        }
    }
```

#### cardMoved
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "fromLane": {
            "id": "1019342352",
            "title": "Ready"
        },
        "toLane": {
            "id": "1019342354",
            "title": "Working"
        }
    }
```

#### commentAdded
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "comment": "Well hello there"
    }
```

#### userAssigned / userUnassigned
```json
    {
        "card": {
            "id": "1234678",
            "title": "card title"
        },
        "user": {
            "id": "10113421486",
            "fullName": "Dan Hardington",
            "emailAddress": "danh@myco.com",
            "avatar": "https://myaccount.leankit.com/avatar/show/10112146/?s=25"
        }
    }
```
---
title: Archive a board
public: true
repo: core-board-service
---
# POST /io/board/:boardId/archive
Archive a board. Administrators will retain read-only access.

### Example Request
```shell
curl -X POST \
  https://myaccount.leankit.com/io/board/10113986616/archive \
  -H 'Authorization: Basic base64encodedauthhere='
```
### Example Response

204 No Content

---
title: List assigned members on a board
public: false
repo: core-board-service
---
# GET /io/board/:boardId/members
List top 50 assigned teams and users on a board. Only assignments to cards on the board or recent archive are counted. If more than 50 teams and users have assigned cards, those with the fewest assignments will be excluded. Return values are sorted first by assignment count, then by team name / user's full name.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`search`|string|Produces a filtered list of matching users and teams|""|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/48392343/members' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Response
```json
{
  "members":
  [
    {
        "id": "1011342486",
        "memberType": "team",
        "display": "D Team",
        "emailAddress": null
    },
    {
        "id": "27019",
        "memberType": "user",
        "display": "John Martinson",
        "emailAddress": "john.martinson@myco.com"
    }
  ]
}
```
---
title: List assigned users on a board
public: true
repo: core-board-service
deprecated: true
---
# GET /io/board/:boardId/assignedUsers
List top 50 assigned users on a board. Only assignments to cards on the board or recent archive are counted. If more than 50 users have assigned cards, those with the fewest assignments will be excluded. Return values are sorted first by assignment count, then by full name.

_Note: This has been deprecated._

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/48392343/assignedUsers' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Response
```json
[
    {
        "id": "1011342486",
        "fullName": "Dan Housington",
        "firstName": "Dan",
        "lastName": "Housington",
        "emailAddress": "danh@myco.com",
        "assignmentCount": 4
    },
    {
        "id": "27019",
        "fullName": "John Martinson",
        "firstName": "John",
        "lastName": "Martinson",
        "emailAddress": "john.martinson@myco.com",
        "assignmentCount": 2
    }
]
```
---
title: List card faces
preview: true
public: true
repo: core-leankit-api
---
# GET /io/board/:boardId/card
Get cards on a board. Sometimes referred to as the "card face" endpoint, this is used to populate the card faces when loading a LeanKit board.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`lanes`|string|Specify a comma-delimited list of lane Ids to limit the result to these lanes.||
|`cards`|string|Specify a comma-delimited list of card Ids to limit the result to these cards only.||
|`ignoreArchiveDate`|boolean|Set to 'true' to include cards that have already been archived and would not normally appear on the board.|false|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|

### Example Request
```shell
curl -X GET \
  https://acmeco.leankit.com/io/board/10100193219/card?limit=10&lanes=10106271134,10112558841' \
  -H 'Authorization: Basic ZGFuaEBwbGFudmlldy4jb206dGVzdDEyMzQ=' \
  -H 'Content-Type: application/json' \
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 18,
        "offset": 0,
        "limit": 10,
        "startRow": 1,
        "endRow": 10
    },
    "cards": [
        {
            "id": "29392943",
            "title": "Title for 10105790505",
            "index": 1,
            "laneId": "10106271134",
            "color": "#9AB6FD",
            "tags": [
                "Tag1"
            ],
            "size": 2,
            "priority": "high",
            "plannedStart": "2019-11-25",
            "plannedFinish": "2019-11-27",
            "actualStart": "2015-09-08T21:36:37Z",
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2015-12-09T23:27:48.000Z",
            "updatedOn": "2019-11-26T21:33:32.000Z",
            "externalLinks": [
                {
                    "label": "LeanKit",
                    "url": "http://leankit.com/"
                }
            ],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null
            },
            "customIcon": null,
            "customHeader": {
                "value": "Sample Card",
                "header": "Sample Card",
                "url": null
            },
            "customId": {
                "value": "Sample Card",
                "prefix": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "10100191335",
                "name": "CardType for 10100191335"
            },
            "subscriptionId": null,
            "parentCards": [],
            "assignedUsers": [],
            "connectedCardStats": {
                "startedCount": 2,
                "startedSize": 2,
                "notStartedCount": 0,
                "notStartedSize": 0,
                "completedCount": 1,
                "completedSize": 1,
                "blockedCount": 0,
                "totalCount": 3,
                "totalSize": 3,
                "plannedStart": null,
                "plannedFinish": null,
                "actualStart": "2019-11-26T16:43:34Z",
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0
            },
            "scoring": {
                "isTemplateChanged": false,
                "scoreTotal": 48.91,
                "scoreOverride": null,
                "confidenceTotal": 55.62,
                "scores": [
                    {
                        "metricId": "1",
                        "score": 31.86,
                        "confidence": 68.21
                    },
                    {
                        "metricId": "2",
                        "score": 57.74,
                        "confidence": 50.28
                    },
                    {
                        "metricId": "3",
                        "score": 41.98,
                        "confidence": 61.53
                    },
                    {
                        "metricId": "4",
                        "score": 43.52,
                        "confidence": 41.40
                    }
                ]
            },
            "canView": true
        },
		{
			// more cards here
		}
	]
}
```
### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer id|internal unique id|
|`title`|string||
|`index`|integer|The position of card (or task) in current lane.|
|`laneId`|integer|The internal unique id of current lane.|
|`color`|hex value||
|`tags`|string array|for example: `[ "bob", "sam" ]`|
|`size`|integer|The user-determined size of card (or task).|
|`priority`|priority value|"low", "normal", "high", or "critical"|
|`plannedStart`|date||
|`plannedFinish`|date||
|`actualStart`|||
|`actualFinish`|||
|`isDone`|boolean|Returns `true` when the card has been moved to archive or a `done` lane.|
|`movedOn`|date||
|`updatedOn`|date||
|`externalLinks`|externalLink array| `{ label: "instagram", url: "http://instagram.com" }`|
|`customIcon.id`|integer id||
|`customIcon.cardColor`|hex value||
|`customIcon.iconColor`|hex value||
|`customIcon.iconName`|string||
|`customIcon.iconPath`|stromg||
|`blockedStatus.isBlocked`|boolean||
|`blockedStatus.reason`|string||
|`customHeader.value`|string|Depending on configuration, this may appear in the card or task header.|
|`customHeader.header`|string|The computed value of the card's header. It is the `value` prefixed with `customId.prefix` below.|
|`customHeader.url`|string|When configured, displays the url link for the header.|
|`customId.value`|string or integer|Similar to customHeader, this is included backward compatibility.|
|`customId.prefix`|string|The configured prefix for the customId / header.|
|`customId.url`|string|When configured, displays the url link for the header.|
|`taskBoardStats.totalCount`|integer||
|`taskBoardStats.completedCount`|integer||
|`taskBoardStats.totalSize`|integer||
|`taskBoardStats.completedSize`|integer||
|`containingCardId`|integer|This is populated when the current object is a task.|
|`cardType.id`|integer||
|`cardType.name`|string||
|`subscriptionId`|integer|This is for internal subscription tracking only; do not use.|
|`parentCards`|array of parentCard|Example: `{ id: 123, title: "A parent card" }`|
|`assignedUsers`|array of users|Example: `{ id: 123, fullName: "John Smith", avatar: (link to avatar), emailAddress: "john@myco.com" }`|
|`connectedCardStats.startedCount`|integer||
|`connectedCardStats.startedSize`|integer||
|`connectedCardStats.notStartedCount`|integer||
|`connectedCardStats.notStartedSize`|integer||
|`connectedCardStats.completedCount`|integer||
|`connectedCardStats.completedSize`|integer||
|`connectedCardStats.blockedCount`|integer||
|`connectedCardStats.totalCount`|integer||
|`connectedCardStats.totalSize`|integer||
|`connectedCardStats.plannedStart`|date||
|`connectedCardStats.plannedFinish`|date||
|`connectedCardStats.actualStart`|date||
|`connectedCardStats.actualFinish`|date||
|`connectedCardStats.pastDueCount`|integer||
|`connectedCardStats.projectedLateCount`|integer||
|`canView`|boolean|Returns `true` if the current user can view the card. This is generally useful in relationship to parent cards. In some cases, a user might know that a particular parent card exists, but does not have permission on that card's board to view the card. |

---
title: Get board changes
public: false
repo: core-board-service
---

# GET /io/board/:boardId/changes
Get board changes since a specific version.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`version`*|string|Specify your current version of the board to get all changes after this version||

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10100193219/changes?version=321' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success
```json
    "boardId": "10113285944",
    "version": "457",
    "updateCount": 10,
    "boardUpdated": true,
    "boardUsersUpdated": false,
    "updatedCardIds": [
        "10113878673",
        "10113968520",
        "10113968551"
    ],
    "createdCardIds": [],
    "deletedCardIds": [],
    "affectedLanes": [
        "10113286053",
        "10113987086"
    ],
    "parentCardsUpdated": false,
    "assignmentChanged": false,
    "updatedParentCardIds": [],
    "updatedChildCardIds": [
        "10113968520",
        "10113968551"
    ],
    "affectedLaneCounts": [
        "10113286053",
        "10113987086"
    ]
}
```

### Response Properties
|property|note|
|--------|----|
|`boardId`|Id of updated board||
|`version`|current version||
|`updateCount`|Count of changes since specified version|
|`boardUpdated`|boolean indicating whether there were layout changes|
|`boardUsersUpdated`|boolean indicating whether there were changes to users|
|`updatedCardIds`|Array of card ids with changes|
|`createdCardIds`|Array of ids for new cards|
|`deletedCardIds`|Array of ids for deleted cards|
|`affectedLanes`|Array of lanes that whose set of cards or position has changed |
|`parentCardsUpdated`|Boolean indicating one or more parent cards changed|
|`assignmentChanged`|Boolean indicating one or more user assignments changed|
|`updatedParentCardIds`|Array of parent card ids with changes|
|`updatedChildCardIds`|Array of child card ids with changes|
|`affectedLaneCounts`|Array of lanes whose card count (or card size) has changed|

### Notes
If the version you specify is greater than the latest version of the board, you'll receive `204 No Content`.
---
title: Create a new board
public: true
repo: core-board-service
---
# POST /io/board
Create a new board.

_Requires at least Board Creator account role._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`title`*|string|The title of the new board.||
|`description`|string|Description is included on the board toolbar below the title.||
|`isShared`|boolean|Set to `true` to share the board with other users by default**|`false`|
|`sharedBoardRole`|enumeration|Specify the default board role users will have when shared. One of:<br />`none`<br />`boardReader`, <br />`boardUser`,<br />`boardManager`<br />`boardAdministrator`|`none`|
|`templateId`|string|Enter a template id to base the board on a template||
|`fromBoardId`||||
|`includeCards`|boolean|Specify `true` to make copies of the cards from the source board or template|`false`|
|`includeExistingUsers`|boolean|Specify `true` to use the same users as the source board|`false`|
|`baseWipOnCardSize`|boolean|Specify `true` to factor in card size when calculating work in progress|`false`|
|`excludeCompletedAndArchiveViolations`|boolean|Specify `true` to exclude completed and archive lanes from WIP calculations|`false`|

\* Required<br />
\** Not recommended for large organizations. Consider copying from another board or template with the correct users for your team.

### Example Requests

#### Default usage
```json
{
	"title": "My new board"
}
```
#### Creating from a template
```json
{
	"title": "Hey I made a board with cards from a template",
	"templateId": "10113986377",
	"includeCards": true
}
```
#### From a board with cards, users and other options
```json
{
	"title": "Hey I copied this board from another one",
	"description": "This should have cards, custom fields and users from the source board and should exclude wip limits and use card size. Custom field values for all source cards will be copied too!",
	"fromBoardId": "10113285944",
	"includeCards": true,
	"includeExistingUsers": true,
	"excludeCompletedAndArchiveViolations": true,
	"baseWipOnCardSize": true
}
```
### Example Successful Response

200 Success
```json
{
    "id": "10116186847"
}
```

---
title: Delete a board
public: true
repo: core-board-service
---
# DELETE /io/board/:boardId
Delete a board in your organization.

_Requires the Account Administrator account role._

### Example Request

```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/10113986378 \
  -H 'Authorization: Basic base64encodedauth='
```

### Example Successful Response

204 No Content

---
title: Export board history
public: true
repo: core-board-service
---
# GET /io/board/:boardId/export
Download a board's history. This is used by the "Export Board History" option on the Board Settings menu.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/export \
  -H 'Authorization: Basic base64encodedauthhere='
```

### Example Response
```text
When,What,Who,Card,Detail,Card Id,From Lane,From Lane Id,To Lane,To Lane Id,EventDescription
01/08/2020 at 11:23:01 AM,Card Move Event,john.mathis@leankit.com,E1 again,Johnny Mathis moved the Card [E1 again] from Doing Now: E1 to E1: E1-a.,10113988569,Doing Now: E1,10113988905,E1: E1-a,10113988921,01/08/2020 11:23:01 AM: Johnny Mathis moved the Card [E1 again] from Doing Now: E1 to E1: E1-a.
01/07/2020 at 01:00:55 PM,Card Move Event,john.mathis@leankit.com,E1 again,Johnny Mathis moved the Card [E1 again] from Not Started - Future Work: Approved to Doing Now: E1.,10113988569,Not Started - Future Work: Approved,10113286046,Doing Now: E1,10113988905,01/07/2020 01:00:55 PM: Johnny Mathis moved the Card [E1 again] from Not Started - Future Work: Approved to Doing Now: E1.
```


---
title: Get board details
public: true
repo: core-board-service
---
# GET /io/board/:boardId
Get the details of a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/943188457' \
  -H 'Authorization: Basic base64encodedauth' \
```
### Example Successful Response

200 Success
```json
{
    "users": [
        {
            "id": "478440842",
            "username": "user@leankit.com",
            "firstName": "First",
            "lastName": "Last",
            "fullName": "First Last",
            "emailAddress": "user@leankit.com",
            "gravatarLink": null,
            "avatar": null,
            "lastAccess": "2019-12-12T22:24:00.436Z",
            "dateFormat": "MM/dd/yyyy",
            "organizationId": "478671678",
            "boardId": "943188457",
            "wip": 0,
            "roleTypeId": 5,
            "settings": {},
            "boardRoles": []
        }
    ],
    "classesOfService": [
        {
            "id": "943188466",
            "name": "Date Dependent",
            "iconPath": "/customicons/24/212121/lk_icons_final_01-13.png",
            "policy": ""
        },
        {
            "id": "943188467",
            "name": "Expedite",
            "iconPath": "/customicons/24/e35027/lk_icons_final_01-03.png",
            "policy": ""
        },
        {
            "id": "943188468",
            "name": "Regulatory",
            "iconPath": "/customicons/24/49bbd6/lk_icons_final_05-11.png",
            "policy": ""
        },
        {
            "id": "943188469",
            "name": "Standard",
            "iconPath": "/customicons/24/212121/blank_icon.png",
            "policy": ""
        }
    ],
    "tags": [
        "tagone",
        "tagtwo"
    ],
    "customFields": [
        {
            "id": "943852689",
            "index": 0,
            "type": "text",
            "label": "Sample Label",
            "helpText": "Sample Text"
        }
    ],
    "id": "943188457",
    "title": "Example board",
    "description": "",
    "creationDate": "2019-12-12T22:24:00.436Z",
    "classOfServiceEnabled": true,
    "customIconFieldLabel": "Class of Service",
    "organizationId": "478671825",
    "version": "118",
    "cardColorField": 1,
    "isCardIdEnabled": true,
    "isHeaderEnabled": true,
    "isHyperlinkEnabled": false,
    "isPrefixEnabled": false,
    "prefix": null,
    "format": null,
    "isPrefixIncludedInHyperlink": false,
    "baseWipOnCardSize": false,
    "excludeCompletedAndArchiveViolations": false,
    "isDuplicateCardIdAllowed": true,
    "isAutoIncrementCardIdEnabled": false,
    "currentExternalCardId": "0",
    "isWelcome": false,
    "isShared": true,
    "isArchived": false,
    "sharedBoardRole": "3",
    "customBoardMoniker": null,
    "isPermalinkEnabled": false,
    "isExternalUrlEnabled": false,
    "allowUsersToDeleteCards": true,
    "allowPlanviewIntegration": false,
    "subscriptionId": null,
    "boardRole": "boardManager",
    "effectiveBoardRole": "boardManager",
    "cardTypes": [
        {
            "id": "943188459",
            "name": "Other Work",
            "colorHex": "#FFFFFF",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188460",
            "name": "Defect",
            "colorHex": "#F1C7C5",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188461",
            "name": "Documentation",
            "colorHex": "#D0CCE0",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188462",
            "name": "Improvement",
            "colorHex": "#BFDFC2",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188463",
            "name": "New Feature",
            "colorHex": "#B8CFDF",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188464",
            "name": "Risk / Issue",
            "colorHex": "#FAD7B2",
            "isCardType": true,
            "isTaskType": false
        },
        {
            "id": "943188465",
            "name": "Subtask",
            "colorHex": "#FFF8DF",
            "isCardType": false,
            "isTaskType": true
        }
    ],
    "laneClassTypes": [
        {
            "id": 0,
            "name": "active"
        },
        {
            "id": 2,
            "name": "archive"
        },
        {
            "id": 1,
            "name": "backlog"
        }
    ],
    "lanes": [
        {
            "id": "943188470",
            "name": "Not Started - Future Work",
            "description": null,
            "cardStatus": "notStarted",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 0,
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 3,
            "wipLimit": 0,
            "cardCount": 3,
            "cardSize": 3,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "backlog",
            "laneType": "ready",
            "isCollapsed": true
        },
        {
            "id": "943188475",
            "name": "New Requests",
            "description": null,
            "cardStatus": "notStarted",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 0,
            "parentLaneId": "943188470",
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": true,
            "columns": 1,
            "wipLimit": 0,
            "cardCount": 2,
            "cardSize": 2,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "backlog",
            "laneType": "ready",
            "isCollapsed": false
        },
        {
            "id": "943188478",
            "name": "Finished As Planned",
            "description": null,
            "cardStatus": "finished",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 0,
            "parentLaneId": "943188471",
            "activityId": null,
            "orientation": "horizontal",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 3,
            "wipLimit": 0,
            "cardCount": 0,
            "cardSize": 0,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "archive",
            "laneType": "untyped",
            "isCollapsed": false
        },
        {
            "id": "943188472",
            "name": "Doing Now",
            "description": null,
            "cardStatus": "started",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 1,
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 2,
            "wipLimit": 0,
            "cardCount": 3,
            "cardSize": 3,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "active",
            "laneType": "inProcess",
            "isCollapsed": false
        },
        {
            "id": "943188477",
            "name": "Started but not Finished",
            "description": null,
            "cardStatus": "finished",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 1,
            "parentLaneId": "943188471",
            "activityId": null,
            "orientation": "horizontal",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 3,
            "wipLimit": 0,
            "cardCount": 0,
            "cardSize": 0,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "archive",
            "laneType": "untyped",
            "isCollapsed": false
        },
        {
            "id": "943188474",
            "name": "Approved",
            "description": null,
            "cardStatus": "notStarted",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 2,
            "parentLaneId": "943188470",
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 1,
            "wipLimit": 0,
            "cardCount": 1,
            "cardSize": 1,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "backlog",
            "laneType": "ready",
            "isCollapsed": false
        },
        {
            "id": "943188476",
            "name": "Discarded Requests / Ideas",
            "description": null,
            "cardStatus": "finished",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 2,
            "parentLaneId": "943188471",
            "activityId": null,
            "orientation": "horizontal",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 3,
            "wipLimit": 0,
            "cardCount": 0,
            "cardSize": 0,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "archive",
            "laneType": "untyped",
            "isCollapsed": false
        },
        {
            "id": "943188479",
            "name": "Under Review",
            "description": null,
            "cardStatus": "started",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 2,
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 2,
            "wipLimit": 0,
            "cardCount": 2,
            "cardSize": 2,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "active",
            "laneType": "inProcess",
            "isCollapsed": false
        },
        {
            "id": "943188473",
            "name": "Recently Finished",
            "description": null,
            "cardStatus": "finished",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 3,
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": true,
            "isDefaultDropLane": false,
            "columns": 2,
            "wipLimit": 0,
            "cardCount": 2,
            "cardSize": 4,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "active",
            "laneType": "completed",
            "isCollapsed": false
        },
        {
            "id": "943188480",
            "name": "Ready to Start",
            "description": null,
            "cardStatus": "notStarted",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 3,
            "parentLaneId": "943188470",
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 1,
            "wipLimit": 0,
            "cardCount": 0,
            "cardSize": 0,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "backlog",
            "laneType": "ready",
            "isCollapsed": false
        },
        {
            "id": "943188471",
            "name": "Finished - Ready to Archive",
            "description": null,
            "cardStatus": "finished",
            "active": true,
            "cardLimit": 0,
            "creationDate": "2019-12-03T23:15:30.040Z",
            "index": 4,
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "columns": 3,
            "wipLimit": 0,
            "cardCount": 0,
            "cardSize": 0,
            "archiveCardCount": 0,
            "subscriptionId": null,
            "laneClassType": "archive",
            "laneType": "completed",
            "isCollapsed": true
        }
    ],
    "laneTypes": [
        {
            "id": 3,
            "name": "completed"
        },
        {
            "id": 99,
            "name": "untyped"
        },
        {
            "id": 1,
            "name": "ready"
        },
        {
            "id": 2,
            "name": "inProcess"
        }
    ],
    "userSettings": {},
    "priorities": [
        {
            "id": 3,
            "name": "critical"
        },
        {
            "id": 2,
            "name": "high"
        },
        {
            "id": 1,
            "name": "normal"
        },
        {
            "id": 0,
            "name": "low"
        }
    ],
    "planningSeries": [
        {
            "id": "10114168786",
            "label": "Planning Series 1"
        },
        {
            "id": "10114168787",
            "label": "Planning Series 2"
        },
    ],
    "layoutChecksum": "0d0b0c57501dc09ed27e0d82aa750b9c",
    "defaultCardTypeId": "943188459",
    "defaultTaskTypeId": "943188465"
}
```
---
title: Get lane counts
public: true
repo: core-board-service
---
# GET /io/board/:boardId/laneCount
Get the count of cards in a board's lanes.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`lanes`|string|Specify a comma-separated list of lanes for which you want counts.|all lanes on board|

### Example Request
```shell
curl -X GET \
  'https://myaccount.leankit.com/io/board/10113285944/laneCount?lanes=10113286046,10113286050' \
  -H 'Authorization: Basic base64encodedauthhere'
  ```

  ### Example Response
  ```json
  {
    "lanes": {
        "10113286046": {
            "cardCount": 2,
            "cardSize": "4"
        },
        "10113286050": {
            "cardCount": 0,
            "cardSize": "0"
        }
    }
  }
  ```
---
title: Get a list of leaf lanes for a board (lanes that can hold cards)
public: true
repo: core-board-service
---
# GET /io/board/:boardId/leafLanes
Get details about the lanes on a board that can hold cards

### Example Request
```shell
curl -X GET \
  'https://myaccount.leankit.com/io/board/10113285944/leafLanes' \
  -H 'Authorization: Basic base64encodedauthhere'
```

  ### Example Response
  ```json
{
    "lanes": [
        {
            "id": "5054565",
            "title": "New Requests",
            "expandedTitle": "Not Started - Future Work:New Requests"
        },
        {
            "id": "5054564",
            "title": "Approved",
            "expandedTitle": "Not Started - Future Work:Approved"
        }
    ]
}
  ```
---
title: List all boards
public: true
repo: core-board-service
openApi: true
operationId: listBoards
---
# GET /io/board
List all boards.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of boards to be returned.|200|
|`search`|string|Filter boards that match the title provided. ||
|`boards`|string|Select only the specified boards by Id||
|`invert`|boolean|Return boards in reverse alphabetical order by title|false|
|`minimumAccess`|enumeration|Return boards where users have this role or greater. Possible roles: none: 0, reader: 1, user: 2, manager: 3 administrator: 4||
|`archived`|boolean|Include archived boards in results. _note: requires organization administrator access_|false|

### Example Request
List all boards
```
curl -X GET \
  https://myaccount.leankit.com/io/board' \
  -H 'Authorization: Basic base64encodedauth' \
```
List boards that have "sample" in the title where the user's access is "manager" or greater
```
curl -X GET \
  https://myaccount.leankit.com/io/board?search=sample&minimumAccess=3' \
  -H 'Authorization: Basic base64encodedauth' \
```
Select board titles by specified id
```
curl -X GET \
  https://myaccount.leankit.com/io/board?boards=12345,9876,423664&only=id,title' \
  -H 'Authorization: Basic base64encodedauth' \
```


### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 2
    },
    "boards": [
        {
            "id": "621306392",
            "title": "Board number 1",
            "description": null,
            "boardRoleId": 4,
            "isWelcome": false,
            "boardRole": "boardAdministrator"
        },
        {
            "id": "814278941",
            "title": "board number 2",
            "description": "Work management board",
            "boardRoleId": 4,
            "isWelcome": false,
            "boardRole": "boardAdministrator"
        }
    ],
    "inaccessibleBoards": {
        {
            "id": "10100032120",
            "isDeleted": false,
            "isArchived": true,
            "hasAccess": true
        }
    }
}
```

Note: "inaccessibleBoards" is included only when requesting boards by Id.

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string|The board id|
|`title`|string|The board title|
|`description`|string|The board description|
|`boardRoleId`|integer|The board role id|
|`isWelcome`|boolean|Indicates if the board is a welcome board|
|`boardRole`|string|The string representation of the board role|
---
title: List parent cards
public: true
repo: core-leankit-api
---
# GET /io/board/:boardId/parent-card
Get parent cards on a board.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113986361/parent-card \
  -H 'Authorization: Basic base64encodedauth='
```
### Example Successful Response
200 Success
```json
{
    "pageMeta": {
        "totalRecords": 1,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 1
    },
    "cards": [
        {
            "title": "Title for 10105790505",
            "index": 1,
            "laneId": "10106271134",
            "color": "#9AB6FD",
            "tags": [
                "Tag1"
            ],
            "size": 2,
            "priority": "high",
            "plannedStart": "2019-11-25",
            "plannedFinish": "2019-11-27",
            "actualStart": "2015-09-08T21:36:37Z",
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2015-12-09T23:27:48.000Z",
            "updatedOn": "2019-11-26T21:33:32.000Z",
            "externalLinks": [
                {
                    "label": "LeanKit",
                    "url": "http://leankit.com/"
                }
            ],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null
            },
            "customIcon": null,
            "customHeader": {
                "value": "Sample Card",
                "header": "Sample Card",
                "url": null
            },
            "customId": {
                "value": "Sample Card",
                "prefix": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "10100191335",
                "name": "CardType for 10100191335"
            },
            "subscriptionId": null,
            "parentCards": [],
            "assignedUsers": [],
            "connectedCardStats": {
                "startedCount": 2,
                "startedSize": 2,
                "notStartedCount": 0,
                "notStartedSize": 0,
                "completedCount": 1,
                "completedSize": 1,
                "blockedCount": 0,
                "totalCount": 3,
                "totalSize": 3,
                "plannedStart": null,
                "plannedFinish": null,
                "actualStart": "2019-11-26T16:43:34Z",
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0
            },
            "canView": true
        }
	]
}
```
---
title: Bulk remove board members and roles
public: true
repo: core-board-service
---
# DELETE /io/board/access
Bulk remove board members and roles.

Warning: this endpoint can be destructive to user subscriptions. If you remove a user's access to a board they will lose any of their subscriptions to changes on cards, lanes, and boards.


### Example Requests
#### Remove by email address
```json
{
	"boardIds": [
		"10113285944"
	],
	"emails": [
		"someguy@myco.com",
		"bob@leankit.com"
	]
}
```
#### Remove by user id
```json
{
	"boardIds": [
		"10113285944",
		"10113245934"
	],
	"userIds": [
		"2305934",
		"1984303",
		"2530034"
	]
}
```

#### Remove by team id
```json
{
	"boardIds": [
		"10113285944",
		"10113245934"
	],
	"teamIds": [
		"5676029323",
		"9812398490",
		"8991021123"
	]
}
```

### Example Response

202 Accepted

### Notable Error Responses
|Status Code|Error Message| Reason|
|---|---|---|
| `422 Unprocessable Entity` | varies | You will receive this error if the input is in the wrong format, the ids or emails are not valid, or if you exceed 500 operations for this request. Operations are calculated as board ids × users (either userIds, emails or teamIds ). 20 users or teams assigned to 20 boards would be considered 400 operations. |
---
title: Subscribe to a board
public: false
repo: core-board-service
---

# PUT /io/board/:boardId/subscribe
Subscribe to a board. This request does not include a body.

### Example Successful Response
201 Created
---
title: Unsubscribe from a board
public: false
repo: core-board-service
---

# DELETE /io/board/:boardId/subscribe
Unsubscribe from a board.

### Example Successful Response
204 No Content
---
title: Export a board as a template
public: false
repo: core-board-service
---
# GET /io/board/:boardId/template
Export the board structure as a template file.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`includeCards`|boolean|If true, it will generate the template with the cards from the board|false|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/943188457/template' \
  -H 'Authorization: Basic base64encodedauth' \
```
### Response

A plain text file download that contains the generated board template.
---
title: Unarchive a board
public: true
repo: core-board-service
---
# POST /io/board/:boardId/unarchive
Restore a board from the board archive.

_Requires the Account Administrator account role._

### Example Request
```shell
curl -X POST \
  https://myaccount.leankit.com/io/board/10113986616/unarchive \
  -H 'Authorization: Basic base64encodedauthhere='
```

### Example Response
204 No Content

---
title: Update a board's layout
public: true
repo: core-board-service
---
# PUT /io/board/:boardId/layout
Update a board's layout by replacing the entire layout object.

_Requires at least manager role on the board specified._

### Example Request Body
```json
{
    "lanes": [
        {
            "id": "10113986293",
            "title": "Not Started - Future Work",
            "type": "ready",
            "classType": "backlog",
            "index": 0,
            "columns": 3,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "children": [
                {
                    "id": "10113986298",
                    "title": "New Requests",
                    "type": "ready",
                    "classType": "backlog",
                    "index": 0,
                    "columns": 1,
                    "orientation": "vertical",
                    "isConnectionDoneLane": false,
                    "isDefaultDropLane": true,
                    "children": [],
                    "wipLimit": 0,
                    "description": null
                }
            ],
            "wipLimit": 0,
            "description": null
        },
        {
            "id": "10113986295",
            "title": "Doing Now",
            "type": "inProcess",
            "classType": "active",
            "index": 1,
            "columns": 2,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "children": [],
            "wipLimit": 0,
            "description": null
        },
        {
            "title": "NEW LANE",
            "type": "untyped",
            "classType": "active",
            "index": 4,
            "columns": 1,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "children": [],
            "wipLimit": 0
        },
        {
            "id": "10113986294",
            "title": "Finished - Ready to Archive",
            "type": "completed",
            "classType": "archive",
            "index": 6,
            "columns": 3,
            "orientation": "vertical",
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "children": [],
            "wipLimit": 0,
            "description": null
        }
    ],
    "layoutChecksum": "2f03a0170a3a51b45e0e8fa3710cf755"
}
```

### Notes
* The lanes object and layoutChecksum are retrieved via the [board GET endpoint](/markdown/board/get.md)
* The layoutChecksum is used to validate that the board layout has not been edited by another user since it was last retrieved.

### Example Successful Response

200 Success
```json
{
    "lanes": [
        {
            "id": "10113986293",
            "title": "Not Started - Future Work",
            "wipLimit": 0,
            "columns": 3,
            "orientation": "vertical",
            "index": 0,
            "type": "ready",
            "classType": "backlog",
            "cardStatus": "notStarted",
            "description": null,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "children": [
                {
                    "id": "10113986298",
                    "title": "New Requests",
                    "wipLimit": 0,
                    "columns": 1,
                    "orientation": "vertical",
                    "index": 0,
                    "type": "ready",
                    "classType": "backlog",
                    "cardStatus": "notStarted",
                    "description": null,
                    "isConnectionDoneLane": false,
                    "isDefaultDropLane": true
                }
            ]
        },
        {
            "id": "10113986295",
            "title": "Doing Now",
            "wipLimit": 0,
            "columns": 2,
            "orientation": "vertical",
            "index": 1,
            "type": "inProcess",
            "classType": "active",
            "cardStatus": "started",
            "description": null,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false
        },
        {
            "id": "10113989209",
            "title": "NEW LANE",
            "wipLimit": 0,
            "columns": 1,
            "orientation": "vertical",
            "index": 2,
            "type": "untyped",
            "classType": "active",
            "cardStatus": "started",
            "description": null,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false
        },
        {
            "id": "10113986296",
            "title": "Recently Finished",
            "wipLimit": 0,
            "columns": 2,
            "orientation": "vertical",
            "index": 3,
            "type": "completed",
            "classType": "active",
            "cardStatus": "finished",
            "description": null,
            "isConnectionDoneLane": true,
            "isDefaultDropLane": false
        },
        {
            "id": "10113986294",
            "title": "Finished - Ready to Archive",
            "wipLimit": 0,
            "columns": 3,
            "orientation": "vertical",
            "index": 4,
            "type": "completed",
            "classType": "archive",
            "cardStatus": "finished",
            "description": null,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false
        }
    ],
    "layoutChecksum": "b41c4d1deb7e46b2180a636020b2e5cf"
}
```

---
title: Bulk update board members and roles
public: true
repo: core-board-service
---
# POST /io/board/access
Bulk update board members and roles.

Warning: this endpoint can be destructive to user assignments and user subscriptions. If you reduce a user's role to `boardReader` they will be unassigned from cards on the targeted boards. If you remove a user's access to a board they will be both unassigned and lose any of their subscriptions to changes on cards, lanes, and boards.


### Example Requests
#### Update by email address
```json
{
	"boardIds": [
		"10113285944"
	],
	"emails": [
		"someguy@myco.com",
		"bob@leankit.com"
	],
	"boardRole": "boardReader"
}
```
#### Update by user id
```json
{
	"boardIds": [
		"10113285944",
		"10113245934"
	],
	"userIds": [
		"2305934",
		"1984303",
		"2530034"
	],
	"boardRole": "boardUser"
}
```

#### Update by team id
```json
{
	"boardIds": [
		"10113285944",
		"10113245934"
	],
	"teamIds": [
		"5676029323",
		"9812398490",
		"8991021123"
	],
	"boardRole": "boardUser"
}
```

### Example Response

204 No Content

### Notable Error Responses
|Status Code|Error Message| Reason|
|---|---|---|
| `422 Unprocessable Entity` | varies | You will receive this error if the input is in the wrong format, the ids or emails are not valid, or if you exceed 500 operations for this request. Operations are calculated as board ids × users (either userIds, emails or teamIds ). 20 users or teams assigned to 20 boards would be considered 400 operations. |
---
title: Update board roles
public: true
repo: core-leankit-api
deprecated: true
---
# PATCH /io/board/:boardId/roles
Create or update board roles for multiple users.

_Note: This has been deprecated in favor of our [Bulk update board users and roles](/markdown/board/update-roles-bulk.md) endpoint._

### Example Request
* Update 2 users
    * one to boardUser (2)
    * one to boardManager (3)
    * both with WIP of 2
* Create one new role (boardManager) for a user
```json
[
	{
		"op":"update",
		"id":"10113566956",
		"userId":"10113421486",
		"WIP":2,
		"roleTypeId":2
	},
	{
		"op":"update",
		"id":"10113873057",
		"userId":"25034",
		"WIP":2,
		"roleTypeId":3
	},
	{
		"op":"create",
		"userId":"10112765904",
		"roleTypeId":3
	}
]
```
### Example Response
```json
{
    "boardRoles": [
        {
            "userId": "10113421486",
            "WIP": 2,
            "roleTypeId": 3,
            "id": "10113566956",
            "boardId": "10113285944"
        },
        {
            "userId": "25034",
            "WIP": 2,
            "roleTypeId": 3,
            "id": "10113873057",
            "boardId": "10113285944"
        },
        {
            "userId": "10113493045",
            "roleTypeId": 3,
            "id": "101138748543",
            "boardId": "10113285944"
        }
    ]
}
```
---
title: Update board settings
public: true
repo: core-board-service
---
# PATCH /io/board/:boardId
Update the settings of a board.

_Requires at least Board Manager account role._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`title`|string|The title of the new board.||
|`description`|string|Description is included on the board toolbar below the title.||
|`isShared`|boolean|Set to `true` to share the board with other users by default*||
|`sharedBoardRole`|enumeration|Specify the default board role users will have when shared. One of:<br />`none`<br />`boardReader`, <br />`boardUser`,<br />`boardManager`<br />`boardAdministrator`|`none`||
|`baseWipOnCardSize`|boolean|Specify `true` to factor in card size when calculating work in progress|`false`||
|`excludeCompletedAndArchiveViolations`|boolean|Specify `true` to exclude completed and archive lanes from WIP calculations||`false`||
|`customBoardUrl`|string|Set a custom url to this board. (i.e. `https://myaccount.leankit.com/myCoolBoard`)||
|`enableCustomIcon`|boolean|`true` / `false`||
|`customIconFieldLabel`|string|Set the label for custom icons.||
|`allowUsersToDeleteCards`|boolean|`true` / `false`||
|`defaultCardType`|string|cardTypeId||
|`defaultTaskType`|string|cardTypeId||
|`allowPlanviewIntegration`|boolean|Allow this board to integrate with Planview Enterprise One. (`true` / `false`)||
|`level`|integer|Specify a board level (1-4). Requires the board levels feature.||

\* Not recommended for large organizations. Consider copying from another board or template with the correct users for your team.

Only send the properties that you wish to modify. You must send at least one change. Excluded properties will remain unchanged. Some options depend on specific features that may not be available.

### Example Requests

#### Default usage
```json
{
	"title": "My new board"
}
```
#### Modifying other settings
```json
{
  "excludeCompletedAndArchiveViolations": true,
  "baseWipOnCardSize": true,
  "customBoardUrl": "teamWildcats"
}
```
### Example Successful Response

204 No Content
```json
{
    "id": "10116186847"
}
```
---
title: List board users
public: true
repo: core-leankit-api
---
# GET /io/board/:boardId/user
List board users and roles.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first user to be returned.|0|
|`limit`|integer|Set the number of users to be returned. max `100` |25|
|`search`|string|Specify a name or email to limit the results||
|`sortBy`|enumeration|Sort by one of:<br />- `name`<br />- `role`<br />- `WIP`<br />- `license`||
|`sortDir`|enumeration|Required when using `sortBy`. Either `asc` or `desc`||
|`roleFilterList`|enumeration array|Specify the roles (by value) to restrict results to those roles. Any of:<br />- `0` (No Access)<br />- `1` (boardReader)<br />- `2` (boardUser)<br />- `3` (boardManager)<br />- `4` (boardAdministrator)
|`licenseFilterList`|enumeration array|Specify the license types to restrict results to those types.<br />- `0` (full)<br />- `1` (focused)<br />- `2` (reader)

### Example Requests
#### Default usage
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/user \
  -H 'Authorization: Basic base64encodedauth=' \
```
#### Searching for a specific user by email
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/user?search=bob@myco.com \
  -H 'Authorization: Basic base64encodedauth=' \
```
#### Sorting Results
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/user?sortBy=name&sortDir=desc \
  -H 'Authorization: Basic base64encodedauth=' \
```
#### Requesting only board managers
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/user?roleFilterList[]=3 \
  -H 'Authorization: Basic base64encodedauth=' \
```
#### Requesting only reader license types
_Note the syntax for specifying multiple array items._
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113285944/user?licenseFilterList[]=1 \
  -H 'Authorization: Basic base64encodedauth=' \
```

### Example Response
200 Success
```json
{
    "pageMeta": {
        "totalRecords": 3,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 3
    },
    "boardUsers": [
        {
            "userId": "10112942343",
            "firstName": "Bob",
            "lastName": "Smith",
            "emailAddress": "Bob@myco.com",
            "boardId": "10113285944",
            "administrator": false,
            "WIP": 0,
            "id": "10113991953",
            "licenseType": "focused",
            "role": {
                "key": "boardReader",
                "value": 1,
                "label": "Reader"
            },
            "assignedBoards": [
                {
                    "id": "10113986361",
                    "title": "Hey I made a board from a template"
                }
            ]
        },
        {
            "userId": "10113421486",
            "firstName": "Dan",
            "lastName": "Hounshell",
            "emailAddress": "danh@planview.com",
            "boardId": "10113285944",
            "administrator": false,
            "WIP": 0,
            "id": "10113566956",
            "licenseType": "full",
            "role": {
                "key": "boardUser",
                "value": 2,
                "label": "User"
            }
        },
        {
            "userId": "25034",
            "firstName": "Doug",
            "lastName": "Neiner",
            "emailAddress": "doug.neiner@leankit.com",
            "boardId": "10113285944",
            "administrator": false,
            "WIP": 0,
            "id": "10113873057",
            "licenseType": "full",
            "role": {
                "key": "boardUser",
                "value": 2,
                "label": "User"
            }
        }
    ]
}
```
---
title: Create a board filter
public: true
repo: core-board-service
---
# POST /io/board/:boardId/filter
Create a board filter.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
|`name`*|string|Name of the filter||
|`isShared`|boolean|Share the filter with other users|false|
|`filters.filterTagByOr`|boolean|Should the tags filter use AND or OR||
|`filters.parentCards`|string array|List of parent card ids, `-1` can be used for `Not Assigned`|||
|`filters.parentCardView`|enumeration|Controls parent card filter display, not currently used||
|`filters.cardTypes`|string array|List of card type ids||
|`filters.classOfServices`|string array|List of custom icon ids , `-1` can be used for `Not Assigned`|||
|`filters.blocks`|integer array|`1` indicates blocked cards, `0` is cards that are not blocked||
|`filters.priorities`|integer array|List of priority values<br />`0` (Normal) <br /> `1` (Low) <br /> `2` (High) <br /> `3` (Critical)||
|`filters.users`|string array|List of assigned user ids||
|`filters.title`|string|Title or custom id match||
|`filters.startDate`|integer|Planned start date is before this number of days from now||
|`filters.finishDate`|integer|Planned finish date is before this number of days from now||
|`filters.plannedStartRange.start`|date|Planned start date is on or after this date||
|`filters.plannedStartRange.end`|date|Planned start date is on or before this date||
|`filters.plannedFinishRange.start`|date|Planned finish date is on or after this date||
|`filters.plannedFinishRange.end`|date|Planned finish date is on or before this date||
|`filters.tags`|string array|List of tags||
|`filters.activity.mode`|enumeration|Possible values are <br />`noActivity` <br />`withActivity` <br /> `notMoved` <br />`haveMoved`||
|`filters.activity.days`|integer|Number of days applied to the activity mode||
|`filters.customFields.id`|string|Id of the custom field being filtered||
|`filters.customFields.type`|enumeration|Possible values are <br />`text` <br />`number` <br />`date` <br />`choice` <br />`multi` ||
|`filters.customFields.filterMethod`|string|Describes the method with which the filter will be applied||
|`filters.customFields.value`|string or string array|The value or list of values for the filter||
|`filters.cardScoring.min`|integer|Minimum card scoring range value||
|`filters.cardScoring.max`|integer|Maximum card scoring range value||

\* Required

### Example Requests
Minimal example
```json
{
  "name": "Filter name",
  "filters": {
    "tags": [ "one" ]
  }
}
```
All fields
```json
{
    "name": "test",
    "isShared": true,
    "filters": {
        "filterTagByOr": false,
        "parentCards": [
            "682817489"
        ],
        "cardTypes": [
            "622011857",
            "622011860"
        ],
        "classOfServices": [
            "622033247",
            -1
        ],
        "blocks": [
            0,
            1
        ],
        "priorities": [
            2,
            0
        ],
        "users": [
            "478440842"
        ],
        "title": "oof",
        "startDate": 2,
        "finishDate": 4,
        "plannedStartRange": {
            "start": "2020-01-07",
            "end": "2020-01-09"
        },
        "plannedFinishRange": {
            "start": "2020-01-09",
            "end": "2020-01-11"
        },
        "tags": [
            "one"
        ],
        "activity": {
            "mode": "withActivity",
            "days": 14
        },
        "customFields": [
            { "id": "123", "type": "text", "filterMethod": "contains|notContain", "value": "value" },
            { "id": "234", "type": "number", "filterMethod": "is|greater|less", "value": "5" },
            { "id": "345", "type": "date", "filterMethod": "is|after|before", "value": "2020-01-13" },
            { "id": "456", "type": "choice", "filterMethod": "contains|notContain", "value": ["value","another"] },
            { "id": "567", "type": "multi", "filterMethod": "contains|notContain", "value": ["5","6"] }
        ],
        "cardScoring": {
          "min": 1,
          "max": 99
        }
    }
}
```

### Example Successful Response
201 Created

```json
{
    "id": "956623925",
    "boardId": "621306390",
    "name": "test",
    "filters": {
        "filterTagByOr": false,
        "parentCards": [
            "682817489"
        ],
        "parentCardView": "textView",
        "cardTypes": [
            "622011857",
            "622011860"
        ],
        "classOfServices": [
            "622033247",
            -1
        ],
        "blocks": [
            0,
            1
        ],
        "priorities": [
            2,
            0
        ],
        "users": [
            "478440842"
        ],
        "title": "sample",
        "startDate": 2,
        "finishDate": 4,
        "plannedStartRange": {
            "start": "2020-01-07",
            "end": "2020-01-09"
        },
        "plannedFinishRange": {
            "start": "2020-01-09",
            "end": "2020-01-11"
        },
        "tags": [
            "one"
        ],
        "activity": {
            "mode": "withActivity",
            "days": 14
        },
        "customFields": [
            { "id": "123", "type": "text", "filterMethod": "contains|notContain", "value": "value" },
            { "id": "234", "type": "number", "filterMethod": "is|greater|less", "value": "5" },
            { "id": "345", "type": "date", "filterMethod": "is|after|before", "value": "2020-01-13" },
            { "id": "456", "type": "choice", "filterMethod": "contains|notContain", "value": ["value","another"] },
            { "id": "567", "type": "multi", "filterMethod": "contains|notContain", "value": ["5","6"] },
        ],
        "cardScoring": {
          "min": 1,
          "max": 99
        }
    },
    "isShared": true,
    "user": {
        "id": "478440842",
        "firstName": "First",
        "lastName": "Last",
        "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25"
    }
}
```

---
title: Delete a board filter
public: true
repo: core-board-service
---
# DELETE /io/board/:boardId/filter/:filterId
Delete a board filter.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/943206946/filter/943867019 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get a board filter
public: true
repo: core-board-service
---
# GET /io/board/:boardId/filter/:filterId
Get a board filter by id.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/943206946/filter/29234888 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "id": "956623925",
    "boardId": "621306390",
    "name": "test",
    "filters": {
        "filterTagByOr": false,
        "parentCards": [
            "682817489"
        ],
        "parentCardView": "textView",
        "cardTypes": [
            "622011857",
            "622011860"
        ],
        "classOfServices": [
            "622033247",
            -1
        ],
        "blocks": [],
        "priorities": [
            2,
            0
        ],
        "users": [
            "478440842"
        ],
        "title": "oof",
        "startDate": 2,
        "finishDate": 4,
        "plannedStartRange": {
            "start": "2020-01-07",
            "end": "2020-01-09"
        },
        "plannedFinishRange": {
            "start": "2020-01-09",
            "end": "2020-01-11"
        },
        "tags": [
            "one"
        ],
        "activity": {
            "mode": "withActivity",
            "days": 14
        },
        "customFields": {
            "id": "82048732",
            "type": "text",
            "filterMethod": "contains",
            "value": "search string"
        }
    },
    "isShared": true,
    "user": {
        "id": "478440842",
        "firstName": "First",
        "lastName": "Last",
        "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25"
    }
}
```
---
title: Get the list of board filters
public: true
repo: core-board-service
---
# GET /io/board/:boardId/filter
Get a list of board filters for a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/943206946/filter \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "filters": [
        {
            "id": "956613516",
            "boardId": "621306390",
            "name": "sample filter",
            "filters": {
                "filterTagByOr": false,
                "parentCards": [
                    "682817489"
                ],
                "parentCardView": "textView",
                "cardTypes": [
                    "622011857",
                    "622011860"
                ],
                "classOfServices": [
                    "622033247",
                    -1
                ],
                "blocks": [],
                "priorities": [
                    2,
                    0
                ],
                "users": [
                    "478440842"
                ],
                "title": "oof",
                "startDate": 2,
                "finishDate": 4,
                "plannedStartRange": {
                    "start": "2020-01-07",
                    "end": "2020-01-09"
                },
                "plannedFinishRange": {
                    "start": "2020-01-09",
                    "end": "2020-01-11"
                },
                "tags": [
                    "one"
                ],
                "activity": {
                    "mode": "withActivity",
                    "days": 14
                },
                "customFields": {
                    "id": "82048732",
                    "type": "text",
                    "filterMethod": "contains",
                    "value": "search string"
                }
            },
            "isShared": true,
            "user": {
                "id": "478440842",
                "firstName": "First",
                "lastName": "Last",
                "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25"
            }
        },
        {
            "id": "956623925",
            "boardId": "621306390",
            "name": "Test filter",
            "filters": {
                "filterTagByOr": false,
                "parentCards": [
                    "682817489"
                ],
                "parentCardView": "textView",
                "cardTypes": [
                    "622011857",
                    "622011860"
                ],
                "classOfServices": [
                    "622033247",
                    -1
                ],
                "blocks": [
                  1,
                  0
                ],
                "priorities": [
                    2,
                    0
                ],
                "users": [
                    "478440842"
                ],
                "title": "oof",
                "startDate": 2,
                "finishDate": 4,
                "plannedStartRange": {
                    "start": "2020-01-07",
                    "end": "2020-01-09"
                },
                "plannedFinishRange": {
                    "start": "2020-01-09",
                    "end": "2020-01-11"
                },
                "tags": [
                    "one"
                ],
                "activity": {
                    "mode": "withActivity",
                    "days": 14
                }
            },
            "isShared": true,
            "user": {
                "id": "478440842",
                "firstName": "First",
                "lastName": "Last",
                "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25"
            }
        }
    ]
}
```
---
title: Update a board filter
public: true
repo: core-board-service
---
# PATCH /io/board/:boardId/filter/:filterId
Update a board filter

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`name`|string|Name of the filter||
|`isShared`|boolean|Share the filter with other users|false|
|`filters.filterTagByOr`|boolean|Should the tags filter use AND or OR||
|`filters.parentCards`|string array|List of parent card ids, `-1` can be used for `Not Assigned`|||
|`filters.parentCardView`|enumeration|Controls parent card filter display, not currently used||
|`filters.cardTypes`|string array|List of card type ids||
|`filters.classOfServices`|string array|List of custom icon ids, `-1` can be used for `Not Assigned`|||
|`filters.blocks`|integer array|`1` indicates blocked cards, `0` is cards that are not blocked||
|`filters.priorities`|integer array|List of priority values<br />`0` (Normal) <br /> `1` (Low) <br /> `2` (High) <br /> `3` (Critical)||
|`filters.users`|string array|List of assigned user ids||
|`filters.title`|string|Title or custom id match||
|`filters.startDate`|integer|Planned start date is before this number of days from now||
|`filters.finishDate`|integer|Planned finish date is before this number of days from now||
|`filters.plannedStartRange.start`|date|Planned start date is on or after this date||
|`filters.plannedStartRange.end`|date|Planned start date is on or before this date||
|`filters.plannedFinishRange.start`|date|Planned finish date is on or after this date||
|`filters.plannedFinishRange.end`|date|Planned finish date is on or before this date||
|`filters.tags`|string array|List of tags||
|`filters.activity.mode`|enumeration|Possible values are <br />`noActivity` <br />`withActivity` <br /> `notMoved` <br />`haveMoved`||
|`filters.activity.days`|integer|Number of days applied to the activity mode||
|`filters.customFields.id`|string|Id of the custom field being filtered||
|`filters.customFields.type`|enumeration|Possible values are <br />`text` <br />`number` <br />`date` <br />`choice` <br />`multi`||
|`filters.customFields.filterMethod`|string|Describes the method with which the filter will be applied||
|`filters.customFields.value`|string or string array|The value or list of values for the filter||
|`filters.cardScoring.min`|integer|Minimum card scoring range value||
|`filters.cardScoring.max`|integer|Maximum card scoring range value||

### Example Request
Minimal request
```json
{
  "filters": {
    "tags": [ "two" ]
  }
}
```
All fields
```json
{
    "filters": {
        "filterTagByOr": false,
        "parentCards": [
            "682817489"
        ],
        "parentCardView": "textView",
        "cardTypes": [
            "622011857",
            "622011860"
        ],
        "classOfServices": [
            "622033247",
            -1
        ],
        "blocks": [
            1
        ],
        "priorities": [
            2,
            0
        ],
        "users": [
          "478440842"
        ],
        "title": "sample title",
        "startDate": 2,
        "finishDate": 4,
        "plannedStartRange": {
            "start": "2020-01-07",
            "end": "2020-01-09"
        },
        "plannedFinishRange": {
            "start": "2020-01-09",
            "end": "2020-01-11"
        },
        "tags": [
            "one",
            "two"
        ],
        "activity": {
            "mode": "withActivity",
            "days": 14
        },
        "customFields": [
            { "id": "123", "type": "text", "filterMethod": "contains|notContain", "value": "value" },
            { "id": "234", "type": "number", "filterMethod": "is|greater|less", "value": "5" },
            { "id": "345", "type": "date", "filterMethod": "is|after|before", "value": "2020-01-13" },
            { "id": "456", "type": "choice", "filterMethod": "contains|notContain", "value": ["value","another"] },
            { "id": "567", "type": "multi", "filterMethod": "contains|notContain", "value": ["5","6"] },
        ],
        "cardScoring": {
          "min": 1,
          "max": 99
        }
    }
}
```

### Example Successful Response
200 OK

```json
{
    "id": "956623925",
    "boardId": "621306390",
    "name": "Sample filter",
    "filters": {
        "filterTagByOr": false,
        "parentCards": [
            "682817489"
        ],
        "parentCardView": "textView",
        "cardTypes": [
            "622011857",
            "622011860"
        ],
        "classOfServices": [
            "622033247",
            -1
        ],
        "blocks": [
          1
        ],
        "priorities": [
            2,
            0
        ],
        "users": [
            "478440842"
        ],
        "title": "sample title",
        "startDate": 2,
        "finishDate": 4,
        "plannedStartRange": {
            "start": "2020-01-07",
            "end": "2020-01-09"
        },
        "plannedFinishRange": {
            "start": "2020-01-09",
            "end": "2020-01-11"
        },
        "tags": [
            "one"
        ],
        "activity": {
            "mode": "withActivity",
            "days": 14
        },
        "customFields": [
            { "id": "123", "type": "text", "filterMethod": "contains|notContain", "value": "value" },
            { "id": "234", "type": "number", "filterMethod": "is|greater|less", "value": "5" },
            { "id": "345", "type": "date", "filterMethod": "is|after|before", "value": "2020-01-13" },
            { "id": "456", "type": "choice", "filterMethod": "contains|notContain", "value": ["value","another"] },
            { "id": "567", "type": "multi", "filterMethod": "contains|notContain", "value": ["5","6"] },
        ],
        "cardScoring": {
          "min": 1,
          "max": 99
        }
    },
    "isShared": true,
    "user": {
        "id": "478440842",
        "firstName": "First",
        "lastName": "Last",
        "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25"
    }
}
```

---
title: Get board health lane bottleneck data
public: false
repo: core-reporting-service
---
# GET /io/reporting/boardHealth/:boardId/laneBottleneck
Get recent bottlenecked lane data for a board.

A bottlenecked lane here is any lane with card count or size in/out delta greater than 1 over the past 7 days. Excludes archive lanes, lanes on task boards, and ConnectedDoneFlag lanes.

Behind feature flag `enableBoardHealth`.

_Requires authentication with at least reader role on the board specified._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`timeOffset`|integer|Time difference in minutes between UTC time and local time.|0|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/reporting/boardHealth/8675309/laneBottleneck?timeOffset=300 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
  "lanes": [ {
    "laneId": "9021060652",
    "in": {
      "cardCount": 3,
      "cardSize": "6"
    },
    "out": {
      "cardCount": 2,
      "cardSize": "5"
    }
  } ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`lanes`|array of objects|bottlenecked lanes|
|`laneId`|string id||
|`in.cardCount`|integer|count of cards that entered lane|
|`in.cardSize`|string|sum of sizes of cards that entered lane|
|`out.cardCount`|integer|count of cards that exited lane|
|`out.cardSize`|string|sum of sizes of cards that exited lane|
---
title: Get board health card throughput data
public: false
repo: core-reporting-service
---
# GET /io/reporting/boardHealth/:boardId/throughput
Get recent card throughput data for a board. Data is bucketed by week, getting current week plus previous eight weeks.

Behind feature flag `enableBoardHealth`.

_Requires authentication with at least reader role on the board specified._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`timeOffset`|integer|Time difference in minutes between UTC time and local time.|0|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/reporting/boardHealth/8675309/throughput?timeOffset=300 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
  "throughput": [ {
    "startOfWeekDate": "2018-11-11T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-11-18T00:00:00.000Z",
    "started": {
      "cardCount": 1,
      "cardSize": "1"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-11-25T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-12-02T00:00:00.000Z",
    "started": {
      "cardCount": 1,
      "cardSize": "5"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-12-09T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 1,
      "cardSize": "1"
    }
  }, {
    "startOfWeekDate": "2018-12-16T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-12-23T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 1,
      "cardSize": "5"
    }
  }, {
    "startOfWeekDate": "2018-12-30T00:00:00.000Z",
    "started": {
      "cardCount": 0,
      "cardSize": "0"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2019-01-06T00:00:00.000Z",
    "started": {
      "cardCount": 1,
      "cardSize": "1"
    },
    "completed": {
      "cardCount": 0,
      "cardSize": "0"
    }
  } ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`throughput`|array of objects|current week plus previous eight weeks|
|`startOfWeekDate`|datetime|beginning of week|
|`started.cardCount`|integer|count of cards started during week|
|`started.cardSize`|string|sum of sizes of cards started during week|
|`completed.cardCount`|integer|count of cards completed during week|
|`completed.cardSize`|string|sum of sizes of cards completed during week|
---
title: Get board health work-in-process data
public: false
repo: core-reporting-service
---
# GET /io/reporting/boardHealth/:boardId/wip
Get recent work-in-process data for a board. Data is bucketed by week, getting current week plus previous eight weeks.

Behind feature flag `enableBoardHealth`.

_Requires authentication with at least reader role on the board specified._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`timeOffset`|integer|Time difference in minutes between UTC time and local time.|0|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/reporting/boardHealth/8675309/wip?timeOffset=300 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
  "workInProcess": [ {
    "startOfWeekDate": "2018-11-11T00:00:00.000Z",
    "wip": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2018-11-18T00:00:00.000Z",
    "wip": {
      "cardCount": 1,
      "cardSize": "1"
    }
  }, {
    "startOfWeekDate": "2018-11-25T00:00:00.000Z",
    "wip": {
      "cardCount": 1,
      "cardSize": "1"
    }
  }, {
    "startOfWeekDate": "2018-12-02T00:00:00.000Z",
    "wip": {
      "cardCount": 2,
      "cardSize": "6"
    }
  }, {
    "startOfWeekDate": "2018-12-09T00:00:00.000Z",
    "wip": {
      "cardCount": 2,
      "cardSize": "6"
    }
  }, {
    "startOfWeekDate": "2018-12-16T00:00:00.000Z",
    "wip": {
      "cardCount": 1,
      "cardSize": "5"
    }
  }, {
    "startOfWeekDate": "2018-12-23T00:00:00.000Z",
    "wip": {
      "cardCount": 1,
      "cardSize": "5"
    }
  }, {
    "startOfWeekDate": "2018-12-30T00:00:00.000Z",
    "wip": {
      "cardCount": 0,
      "cardSize": "0"
    }
  }, {
    "startOfWeekDate": "2019-01-06T00:00:00.000Z",
    "wip": {
      "cardCount": 1,
      "cardSize": "1"
    }
  } ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`workInProcess`|array of objects|current week plus previous eight weeks|
|`startOfWeekDate`|datetime|beginning of week|
|`wip.cardCount`|integer|count of cards in process during week|
|`wip.cardSize`|string|sum of sizes of cards in process during week|
---
title: Create, update, or delete board levels
public: true
repo: core-board-service
---
# PUT /io/boardLevel
Create, update, or delete board levels.

All levels need to be included in the payload. Levels without an id will be created. Missing levels will be deleted.

### Request Properties
|Param|Type|Usage|Default|
|-----|----|-----|-------|
|`id`|string|Id of the board level||
|`label`*|string|Label of the board level used for display||
|`color`*|string|Hexadecimal color of the level||
|`depth`*|integer|Level depth, values 1-4 are allowed||

### Example Request
```json
{
	"boardLevels": [
		{
			"id": "951195396",
			"label": "Portfolioo",
			"color": "#2966a3",
			"depth": 1
		},
		{
			"id": "951195397",
			"label": "Program",
			"color": "#328048",
			"depth": 2
		},
		{
			"id": "951195398",
			"label": "Team",
			"color": "#ff841f",
			"depth": 3
		},
		{
			"label": "Test Level",
			"color": "#5b499e",
			"depth": 4
		}
	]
}
```

### Example Successful Response
200 OK

```json
{
	"levelIds": [
		"951195396",
		"951195397",
		"951195398",
		"960989143"
	]
}
```

---
title: List board levels
public: true
repo: core-board-service
---
# GET /io/boardLevel
List board levels.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/boardLevel \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "boardLevels": [
        {
            "id": "961018244",
            "depth": 1,
            "maxDepth": 4,
            "label": "Portfolioo",
            "color": "#2966a3",
            "unarchivedBoardCount": 1,
            "archivedBoardCount": 0
        },
        {
            "id": "961018245",
            "depth": 2,
            "maxDepth": 4,
            "label": "Program",
            "color": "#328048",
            "unarchivedBoardCount": 2,
            "archivedBoardCount": 0
        },
        {
            "id": "961018246",
            "depth": 3,
            "maxDepth": 4,
            "label": "Team",
            "color": "#ff841f",
            "unarchivedBoardCount": 2,
            "archivedBoardCount": 0
        },
        {
            "id": "961018247",
            "depth": 4,
            "maxDepth": 4,
            "label": "Test Level",
            "color": "#5b499e",
            "unarchivedBoardCount": 1,
            "archivedBoardCount": 0
        }
    ]
}
```
---
public: true
title: Create a board template
repo: core-board-service
---
# POST /io/template
Create a board template from a board.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
|`boardId`*|string|Id of the board to base the template on||
|`templateName`*|string|Name of the template||
|`templateDescription`|string|Description of the template||
|`includeCards`|string|Should the cards on the board be included in the template|false|

### Example Requests
```json
{
	"boardId": "566725739",
	"templateName": "This is a template",
	"templateDescription": "The description is here",
	"includeCards": true
}
```

### Example Successful Response

201 Created
```json
{
    "id": "961080549"
}
```
---
public: true
title: Delete a board template
repo: core-board-service
---
# DELETE /io/template/:templateId
Delete a board template.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/template/1234234' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

204 No Content
---
public: true
title: Get a board template
repo: core-board-service
---
# GET /io/template/:templateId
Get a board template by id.


### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/template/961080549' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 OK
```json
{
    "id": "961065792",
    "name": "This is a sample template",
    "description": "The description is here",
    "template": {
        "classOfServiceEnabled": false,
        "customIconFieldLabel": "Class of Service",
        "cardColorField": 1,
        "baseWipOnCardSize": false,
        "cardTypes": [
            {
                "id": "567272386",
                "name": "Other Work",
                "colorHex": "#FFFFFF",
                "isDefault": true,
                "isCardType": true,
                "isTaskType": false,
                "isDefaultTaskType": false
            },
            {
                "id": "567272387",
                "name": "Defect",
                "colorHex": "#FE7676",
                "isDefault": false,
                "isCardType": true,
                "isTaskType": false,
                "isDefaultTaskType": false
            },
            {
                "id": "567272388",
                "name": "Improvement",
                "colorHex": "#D6FA98",
                "isDefault": false,
                "isCardType": true,
                "isTaskType": false,
                "isDefaultTaskType": false
            },
            {
                "id": "567272389",
                "name": "Risk / Issue",
                "colorHex": "#FDD29A",
                "isDefault": false,
                "isCardType": true,
                "isTaskType": false,
                "isDefaultTaskType": false
            },
            {
                "id": "567272390",
                "name": "New Feature",
                "colorHex": "#93E0E6",
                "isDefault": false,
                "isCardType": true,
                "isTaskType": false,
                "isDefaultTaskType": false
            },
            {
                "id": "567272391",
                "name": "Subtask",
                "colorHex": "#F8F7D2",
                "isDefault": false,
                "isCardType": false,
                "isTaskType": true,
                "isDefaultTaskType": true
            }
        ],
        "customIcons": [
            {
                "id": "567288729",
                "title": "Date Dependent",
                "policy": "",
                "iconPath": "../../Content/Images/Icons/Library/calculator.png",
                "customIconName": null,
                "customIconColor": null
            },
            {
                "id": "567288730",
                "title": "Expedite",
                "policy": "",
                "iconPath": "../../Content/Images/Icons/Library/arrow_right.png",
                "customIconName": null,
                "customIconColor": null
            },
            {
                "id": "567288731",
                "title": "Regulatory",
                "policy": "",
                "iconPath": "../../Content/Images/Icons/Library/check.png",
                "customIconName": null,
                "customIconColor": null
            },
            {
                "id": "567288732",
                "title": "Standard",
                "policy": "",
                "iconPath": "../../Content/Images/Icons/Library/blank.gif",
                "customIconName": null,
                "customIconColor": null
            }
        ],
        "format": null,
        "isCardIdEnabled": true,
        "isDuplicateCardIdAllowed": true,
        "isHeaderEnabled": true,
        "isHyperlinkEnabled": false,
        "isPrefixEnabled": false,
        "isPrefixIncludedInHyperlink": false,
        "prefix": null,
        "boardLevelId": "961018244",
        "lanes": [
            {
                "id": "-567306602",
                "index": 0,
                "description": null,
                "name": "Not Started - Future Work",
                "title": "Not Started - Future Work",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "columns": 3,
                "orientation": "vertical",
                "laneClassType": "backlog",
                "laneType": "ready"
            },
            {
                "id": "-567306603",
                "index": 2,
                "description": null,
                "name": "Approved",
                "title": "Approved",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306602",
                "columns": 1,
                "orientation": "vertical",
                "laneClassType": "backlog",
                "laneType": "ready"
            },
            {
                "id": "-567306604",
                "index": 0,
                "description": null,
                "name": "New Requests",
                "title": "New Requests",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306602",
                "columns": 1,
                "orientation": "vertical",
                "laneClassType": "backlog",
                "laneType": "ready"
            },
            {
                "id": "-567306605",
                "index": 3,
                "description": null,
                "name": "Ready to Start",
                "title": "Ready to Start",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306602",
                "columns": 1,
                "orientation": "vertical",
                "laneClassType": "backlog",
                "laneType": "ready"
            },
            {
                "id": "-567306606",
                "index": 4,
                "description": null,
                "name": "Finished - Ready to Archive",
                "title": "Finished - Ready to Archive",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "columns": 3,
                "orientation": "vertical",
                "laneClassType": "archive",
                "laneType": "completed"
            },
            {
                "id": "-567306607",
                "index": 2,
                "description": null,
                "name": "Discarded Requests / Ideas",
                "title": "Discarded Requests / Ideas",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306606",
                "columns": 3,
                "orientation": "horizontal",
                "laneClassType": "archive",
                "laneType": "untyped"
            },
            {
                "id": "-567306608",
                "index": 1,
                "description": null,
                "name": "Started but not Finished",
                "title": "Started but not Finished",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306606",
                "columns": 3,
                "orientation": "horizontal",
                "laneClassType": "archive",
                "laneType": "untyped"
            },
            {
                "id": "-567306609",
                "index": 0,
                "description": null,
                "name": "Finished As Planned",
                "title": "Finished As Planned",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "parentLaneId": "-567306606",
                "columns": 3,
                "orientation": "horizontal",
                "laneClassType": "archive",
                "laneType": "untyped"
            },
            {
                "id": "-567306610",
                "index": 1,
                "description": null,
                "name": "Doing Now",
                "title": "Doing Now",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "columns": 2,
                "orientation": "vertical",
                "laneClassType": "active",
                "laneType": "inProcess"
            },
            {
                "id": "-567306611",
                "index": 2,
                "description": null,
                "name": "Under Review",
                "title": "Under Review",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": false,
                "cards": [],
                "columns": 4,
                "orientation": "vertical",
                "laneClassType": "active",
                "laneType": "inProcess"
            },
            {
                "id": "-567306612",
                "index": 3,
                "description": null,
                "name": "Recently Finished",
                "title": "Recently Finished",
                "cardLimit": 0,
                "isDefaultDropLane": false,
                "isConnectionDoneLane": true,
                "cards": [],
                "columns": 2,
                "orientation": "vertical",
                "laneClassType": "active",
                "laneType": "completed"
            }
        ]
    },
    "isDefault": false,
    "isUserCategory": true
}
```
---
public: true
title: List board templates
repo: core-board-service
---
# GET /io/template
List the board templates grouped by category. These include global templates and templates created by your organization.


### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/template' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 OK
```json
{
    "categories": [
        {
            "id": "1",
            "name": "Our Boards",
            "templates": [
                {
                    "id": "757431863",
                    "name": "single card template",
                    "description": "The description",
                    "isEnabled": true,
                    "isGlobal": false
                }
            ]
        },
        {
            "id": "12",
            "name": "Engineering Operations & Manufacturing Boards",
            "templates": [
                {
                    "id": "107",
                    "name": "Iterative Deming PDCA",
                    "description": "This example shows you can model a cyclical process within a Kanban board, using the classic Lean tool, PDCA (Plan-Do-Check-Act), also called \"The Deming Cycle\".",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "3",
            "name": "IT Operations Boards",
            "templates": [
                {
                    "id": "100",
                    "name": "Business Process Maintenance",
                    "description": "This example shows a board where flow is from left to right, and coarse-grained priority is ranked from top to bottom.  It provides excellent visibility into Time and Scope, but WIP limits are slightly more difficult to manage.   Based on a Kanban board design by Mattias Skarin (http://blog.crisp.se/mattiasskarin), used by permission.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "110",
                    "name": "DevOps Workflow",
                    "description": "This example shows a board where Dev and Ops are managing their work in a joint view. Flow is from left to right and helps the Operations team initiate work based on collaboration with Dev. The teams are able to identify their expedited and standard flow of work. WIP limits are in place to ensure optimal output. It provides excellent visibility into the overall process of how a requirement goes from initiation to deployment. ",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "116",
                    "name": "Operations Daily Deliverables",
                    "description": "This example shows a board where the input method and category of work is being explicitly captured.  Flow is from left to right and helps the team identify their expedited and standard flow of work.  WIP limits are in place to ensure optimal output.  It provides excellent visibility into measuring planned vs unplanned work to determine process improvements and understanding trends.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "132",
                    "name": "System Administration",
                    "description": "This example is for a System Administrator team supporting development and production environments. Items enter at the bottom \"New\" lane and flow upwards to \"Done\". Priority is from right to left, where \"Production\" items have the highest priority and the project-specific planned work has the lowest priority.   Based on a Kanban board design by Mattias Skarin (http://blog.crisp.se/mattiasskarin), used by permission. ",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "13",
            "name": "ITSM (IT Service Management) Boards",
            "templates": [
                {
                    "id": "102",
                    "name": "Change Authorization (Process & Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "101",
                    "name": "Change Authorization (Process Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "104",
                    "name": "Change Implementation (Process & Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "103",
                    "name": "Change Implementation (Process Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "112",
                    "name": "Incident Management (Process & Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "111",
                    "name": "Incident Management (Process Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "114",
                    "name": "Major Incident Management",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "115",
                    "name": "Network Team (Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "113",
                    "name": "Other ITSM Team (Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "119",
                    "name": "Problem Management (Process & Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "118",
                    "name": "Problem Management (Process Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "131",
                    "name": "Server Team (Team Activity)",
                    "description": "",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "0",
            "name": "Other Boards",
            "templates": [
                {
                    "id": "108",
                    "name": "Default Template",
                    "description": "This template represents a basic process flow of not started, started, finished.",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "11",
            "name": "SAFe (Scaled Agile Framework) Boards",
            "templates": [
                {
                    "id": "125",
                    "name": "SAFe Essential - Program Board",
                    "description": "SAFe Essential - Program Board",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "127",
                    "name": "SAFe Essential - Teams Board",
                    "description": "SAFe Essential - Teams Board",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "123",
                    "name": "SAFe Objectives Board",
                    "description": "SAFe Objectives Board",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "124",
                    "name": "SAFe Portfolio Board",
                    "description": "SAFe Portfolio Board",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "126",
                    "name": "SAFe Risks Board",
                    "description": "SAFe Risks Board",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "128",
                    "name": "SAFe Value Stream",
                    "description": "SAFe Value Stream",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "2",
            "name": "Software Development Boards",
            "templates": [
                {
                    "id": "106",
                    "name": "Complex Feature Delivery",
                    "description": "This example includes many of the advanced possibilities for board design in one large board. A categorized backlog, parallel feature development lanes, and a cyclical testing/rework process, as well as post-deployment and \"dogfooding\" activities, and a subdivided archive.  Classes of service have detailed policies defined.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "109",
                    "name": "Development Flow",
                    "description": "One of several ways to design a board with an \"Expedite\" lane across the top of the board.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "130",
                    "name": "Scrum Team Sprint",
                    "description": "A detailed example of how a team that is already practicing Scrum might introduce some features of Kanban into their process. Includes a detailed description of how to move items from product backlog to sprint backlog, use WIP limits for in-process work, and manage the sprint using a visual board.",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        },
        {
            "id": "10",
            "name": "Strategy and Execution Boards",
            "templates": [
                {
                    "id": "105",
                    "name": "Company Planning",
                    "description": "This template demonstrates a possible configuration for managing a portfolio of projects.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "117",
                    "name": "Personal Kanban",
                    "description": "Example of a personal Kanban board for a fictional CEO",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "120",
                    "name": "Project Delivery",
                    "description": "This template demonstrates a possible configuration for managing a standard project.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "121",
                    "name": "Project Portfolio",
                    "description": "This example shows many possibilities for lanes you might want on your Personal Kanban board. Includes a section for specific projects, goals, \"avoidance\", scheduled activities, and \"Daily Habits\"",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "122",
                    "name": "Project Strategy",
                    "description": "While \"Kanban\" is primarily about Flow and limiting WIP, you can also use LeanKit to visualize things that have little do to with Flow. In this Strategy Canvas example, you can see how you might use LeanKit to organize your thoughts and collaborate with others on a strategic level.",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "129",
                    "name": "Sales Pipeline",
                    "description": "Example of a sales pipeline visualization with separate swimlanes for region / sector sales teams, product / service card types, and account-size class of service",
                    "isEnabled": true,
                    "isGlobal": true
                },
                {
                    "id": "9",
                    "name": "Welcome To LeanKit!",
                    "description": "Click Here To Open This Board",
                    "isEnabled": true,
                    "isGlobal": true
                }
            ]
        }
    ]
}
```
---
title: Get recent card activity
public: true
repo: core-card-service
---

# GET /io/card/:cardId/activity
Get card activity.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`limit`|integer|Specify the number of events to receive|100|
|`eventId`|string|Support paging of events by specifying the last event id received.|null|
|`direction`|enumeration|Specify `older` posts as you scroll, or `newer`.|`older`|


### Example Requests

#### Defaults
```shell
curl -X GET \
	https://myaccount.leankit.com/io/card/10113988569/activity' \
	-H 'Authorization: Basic base64encodedauth' \
```

####
```shell
curl -X GET \
	https://myaccount.leankit.com/io/card/10113988569/activity?limit=25&eventId=457634234&direction=newer' \
	-H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response
```json
{
	"events": [
		{
			"id": "10113988923",
			"type": "cardMoved",
			"timestamp": "2020-01-08T17:23:01Z",
			"user": {
				"id": "1111",
				"fullName": "Test User",
				"avatar": "https://myaccount.leankit.com/avatar/show/1111/?s=25"
			},
			"data": {
				"card": {
					"id": "1000",
					"title": "Test Card"
				},
				"fromLane": {
					"id": "100",
					"title": "Doing Now"
				},
				"toLane": {
					"id": "101",
					"title": "Finished"
				}
			}
		}
	]
}
```

## Event Types:

### Attachments
- [attachmentAdded](#attachmentAdded)
- [attachmentDeleted](#attachmentDeleted)

### Cards
- [cardCreated](#cardCreated)
- [cardChanged](#cardChanged)
- [cardBlocked](#cardBlocked)
- [cardUnblocked](#cardUnblocked)
- [cardMoved](#cardMoved)
- [cardMovedOffBoard](#cardMovedOffBoard)
- [cardMovedToTaskBoard](#cardMovedToTaskBoard)

### Tasks
- [taskCardCreated](#taskCardCreated)
- [taskCardMoved](#taskCardMoved)
- [taskCardMovedToBoard](#taskCardMovedToBoard)

### Users
- [userAssigned](#userAssigned)
- [userUnassigned](#userUnassigned)

### Comments
- [commentAdded](#commentAdded)

### Connections
- [cardChildConnectionCreated](#cardChildConnectionCreated)
- [cardChildConnectionDeleted](#cardChildConnectionDeleted)
- [cardParentConnectionCreated](#cardParentConnectionCreated)
- [cardParentConnectionDeleted](#cardParentConnectionDeleted)
- [boardConnected](#boardConnected)
- [boardDisconnected](#boardDisconnected)

### Card Mirroring
- [cardSyncDestinationCreated](#cardSyncDestinationCreated)
- [cardSyncDestinationDeleted](#cardSyncDestinationDeleted)
- [cardSyncSourceCreated](#cardSyncSourceCreated)
- [cardSyncSourceDeleted](#cardSyncSourceDeleted)

### Other
- [laneWipExceeded](#laneWipExceeded)
- [userWipExceeded](#userWipExceeded)

## Event Data:
#### <a name="attachmentAdded">attachmentAdded</a>
```json
{
	"type": "attachmentAdded",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"fileName": "test.txt",
		"comment": "attachment comment"
	}
}
```

#### <a name="attachmentDeleted">attachmentDeleted</a>
```json
{
	"type": "attachmentDeleted",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"fileName": "test.txt",
		"comment": "attachment comment"
	}
}
```

#### <a name="cardCreated">cardCreated</a>
```json
{
	"type": "cardCreated",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"lane": {
			"id": "100",
			"title": "Doing Now"
		}
	}
}
```

#### <a name="cardChanged">cardChanged</a>
```json
{
	"type": "cardChanged",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"fields": [
			{
				"name": "size",
				"oldValue": "0",
				"newValue": "1"
			},
			{
				"name": "description",
				"oldValue": null,
				"newValue": "<p>Updated Description</p>"
			}
		]
	}
}
```

#### <a name="cardBlocked">cardBlocked</a>
```json
{
	"type": "cardBlocked",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"comment": "test blocking comment"
	}
}
```

#### <a name="cardUnblocked">cardUnblocked</a>
```json
{
	"type": "cardUnblocked",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"comment": "test unblocking comment"
	}
}
```

#### <a name="cardMoved">cardMoved</a>
```json
{
	"type": "cardMoved",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"fromLane": {
			"id": "100",
			"title": "Doing Now"
		},
		"toLane": {
			"id": "101",
			"title": "Finished"
		}
	}
}
```

#### <a name="cardMovedOffBoard">cardMovedOffBoard</a>
```json
{
	"type": "cardMovedOffBoard",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"fromLane": {
			"id": "100",
			"title": "Doing Now"
		},
		"fromBoard": {
			"id": "10",
			"title": "Board A"
		},
		"toBoard": {
			"id": "20",
			"title": "Board B"
		},
		"toLane": {
			"id": "200",
			"title": "Not Started"
		}
	}
}
```

#### <a name="cardMovedToTaskBoard">cardMovedToTaskBoard</a>
```json
{
	"type": "cardMovedToTaskBoard",
	"data": {
		"card": {
			"id": "2000",
			"title": "Card converted to Task"
		},
		"fromLane": {
			"id": "100",
			"title": "Doing Now"
		},
		"toLane": {
			"id": "110",
			"title": "ToDo"
		},
		"parentCard": {
			"id": "1000",
			"title": "Test Card"
		}
	}
}
```

#### <a name="taskCardCreated">taskCardCreated</a>
```json
{
	"type": "taskCardCreated",
	"data": {
		"card": {
			"id": "3000",
			"title": "Task Card"
		},
		"lane": {
			"id": "110",
			"title": "ToDo"
		},
		"parentCard": {
			"id": "1000",
			"title": "Test Card"
		}
	}
}
```

#### <a name="taskCardMoved">taskCardMoved</a>
```json
{
	"type": "taskCardMoved",
	"data": {
		"card": {
			"id": "3000",
			"title": "Task Card"
		},
		"fromLane": {
			"id": "110",
			"title": "ToDo"
		},
		"toLane": {
			"id": "111",
			"title": "Doing"
		},
		"parentCard": {
			"id": "1000",
			"title": "Test Card"
		}
	}
}
```

#### <a name="taskCardMovedToBoard">taskCardMovedToBoard</a>
```json
{
	"type": "taskCardMovedToBoard",
	"data": {
		"card": {
			"id": "3000",
			"title": "Task Card"
		},
		"fromLane": {
			"id": "111",
			"title": "Doing"
		},
		"fromBoard": {
			"id": "10",
			"title": "Board A"
		},
		"toBoard": {
			"id": "20",
			"title": "Board B"
		},
		"toLane": {
			"id": "200",
			"title": "Not Started"
		}
	}
}
```

#### <a name="userAssigned">userAssigned</a>
```json
{
	"type": "userAssigned",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"user": {
			"id": "1111",
			"fullName": "Test User",
			"emailAddress": "test.user@myaccount.com",
			"avatar": "http://myaccount.leankit.com/avatar/show/1111/?s=25"
		}
	}
}
```

#### <a name="userUnassigned">userUnassigned</a>
```json
{
	"type": "userUnassigned",
	"data": {
	"card": {
	  "id": "1000",
	  "title": "Test Card"
	},
	"user": {
	  "id": "1111",
	  "fullName": "Test User",
	  "emailAddress": "test.user@myaccount.com",
	  "avatar": "http://myaccount.leankit.com/avatar/show/1111/?s=25"
	}
  }
}
```

#### <a name="commentAdded">commentAdded</a>
```json
{
	"type": "commentAdded",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"comment": "<p>test comment</p>"
	}
}
```

#### <a name="cardChildConnectionCreated">cardChildConnectionCreated</a>
```json
{
	"type": "cardChildConnectionCreated",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"childCard": {
			"id": "4000",
			"title": "child"
		}
	}
}
```

#### <a name="cardChildConnectionDeleted">cardChildConnectionDeleted</a>
```json
{
	"type": "cardChildConnectionDeleted",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"childCard": {
			"id": "4000",
			"title": "child"
		}
	}
}
```

#### <a name="cardParentConnectionCreated">cardParentConnectionCreated</a>
```json
{
	"type": "cardParentConnectionCreated",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"parentCard": {
			"id": "5000",
			"title": "Parent Card"
		}
	}
}
```

#### <a name="cardParentConnectionDeleted">cardParentConnectionDeleted</a>
```json
{
	"type": "cardParentConnectionDeleted",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"parentCard": {
			"id": "5000",
			"title": "Parent Card"
		}
	}
}
```

#### <a name="boardConnected">boardConnected</a>
```json
{
	"type": "boardConnected",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"board": {
			"id": "10",
			"title": "Board A"
		}
	}
}
```

#### <a name="boardDisconnected">boardDisconnected</a>
```json
{
	"type": "boardDisconnected",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"board": {
			"id": "10",
			"title": "Board A"
		}
	}
}
```

#### <a name="cardSyncDestinationCreated">cardSyncDestinationCreated</a>
```json
{
	"type": "cardSyncDestinationCreated",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"destinationCard": {
			"id": "1002",
			"title": "Test Card"
		}
	}
}
```

#### <a name="cardSyncDestinationDeleted">cardSyncDestinationDeleted</a>
```json
{
	"type": "cardSyncDestinationDeleted",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"destinationCard": {
			"id": "1002",
			"title": "Test Card"
		}
	}
}
```

#### <a name="cardSyncSourceCreated">cardSyncSourceCreated</a>
```json
{
	"type": "cardSyncSourceCreated",
	"data": {
		"card": {
			"id": "1002",
			"title": "Test Card"
		},
		"sourceCard": {
			"id": "1000",
			"title": "Test Card"
		}
	}
}
```

#### <a name="cardSyncSourceDeleted">cardSyncSourceDeleted</a>
```json
{
	"type": "cardSyncSourceDeleted",
	"data": {
		"card": {
			"id": "1002",
			"title": "Test Card"
		},
		"sourceCard": {
			"id": "1000",
			"title": "Test Card"
		}
	}
}
```

#### <a name="laneWipExceeded">laneWipExceeded</a>
```json
{
	"type": "laneWipExceeded",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"lane": {
			"id": "100",
			"title": "Doing Now"
		},
		"comment": "Wip override comment"
	}
}
```

#### <a name="userWipExceeded">userWipExceeded</a>
```json
{
	"type": "userWipExceeded",
	"data": {
		"card": {
			"id": "1000",
			"title": "Test Card"
		},
		"user": {
			"id": "1111",
			"fullName": "Test User",
			"emailAddress": "test.user@myaccount.com",
			"avatar": "http://myaccount.leankit.com/avatar/show/1111/?s=25"
		},
		"comment": "test user wip override"
	}
}
```
---
title: Assign or unassign one or more users or teams to cards
public: true
repo: core-leankit-api
---
# POST /io/card/assign
Assign or unassign one or more users or teams to cards.

### Example Requests
Assign multiple users and teams to multiple cards
```json
{
  "cardIds": ["945202295", "945233018"],
  "userIdsToAssign": ["478440842", "583458214"],
  "teamIdsToAssign": ["1011342486"],
  "userIdToUnassign": ["123456789"],
  "teamIdToUnassign": ["987654321"]
}
```

Unassign a user from a card
```json
{
  "cardIds": ["945202295"],
  "userIdsToUnassign": ["478440842"]
}
```

Unassign a team from a card
```json
{
  "cardIds": ["945202295"],
  "teamIdsToUnassign": ["1011342486"]
}
```

### Example Successful Response

200 OK
```json
{
    "updatedBoards": [
        {
            "boardId": "944576308",
            "version": "15"
        }
    ]
}
```


---
title: Bulk update cards
public: false
repo: core-card-service
---

# PATCH /io/card/bulk
Bulk update cards. Provide an array of cardIds to update, and the update operations to apply to each card. This endpoint uses the same data structure for update operations as specified in the [Card Update](/markdown/card/update.md) endpoint. All updates must be valid for all specified cards.

### Request Properties
|Param|Type|Usage|
|---|---|---|
|`cardIds`*|string array|collection of card ids to update|
|`updates`*|object array|collection of operations as outlined [here](/markdown/card/update.md) ( see exceptions ** )|

\* required

** Updating `mirrorSourceCardId` is not permitted when bulk updating cards.


### Example Request Body
```json
{
    "cardIds": ["10114433203", "10114433205"],
    "updates": [
      { "op": "replace", "path": "/title", "value": "Desert" },
      { "op": "replace", "path": "/description", "value": "Cactus 🌵" },
    ]
}
```

### Example Successful Response

202 Accepted
---
title: Create a task card
public: true
repo: core-leankit-api
deprecated: true
---
# POST /io/card/:cardId/tasks
Create a task card.

_Note: This has been deprecated in favor of our [Card create](/markdown/card/create.md) endpoint._

### Example Requests
Minimum fields required
```json
{
  "title": "The title of the task",
  "laneType": "ready",
  "typeId": "944576314"
}
```
All fields
```json
{
    "title": "The title of the task",
    "typeId": "944576314",
    "laneType": "completed",
    "assignedUserIds": [ "2" ],
    "description": "The card description",
    "size": 1,
    "blockReason": "The block reason",
    "priority": "normal",
    "customIconId": "944576317",
    "customId": "Task header text",
    "externalLink": {
        "label": "The link label",
        "url": "https://www.leankit.com"
    },
    "index": 0,
    "plannedStart": "2020-01-20",
    "plannedFinish": "2020-02-01",
    "tags": [
        "tagOne",
        "tagTwo"
    ],
    "wipOverrideComment": "The override reason"
}
```
Creating a task at a specific lane position (index)

_Note: Avoid using a specific index if possible. Operations that explicitly modify index are slower._
```json
{
  "title": "The title of the task",
  "laneType": "ready",
  "typeId": "944576314",
  "index": 0
}
```

### Example Successful Response
201 Created
```json
{
    "id": "945261794",
    "index": 0,
    "description": "The card description",
    "tags": [
        "tagOne",
        "tagTwo"
    ],
    "title": "The title of the task",
    "size": 1,
    "version": "1",
    "priority": "normal",
    "createdOn": "2020-03-26T16:15:24Z",
    "archivedOn": null,
    "plannedStart": "2020-01-20",
    "plannedFinish": "2020-02-01",
    "actualStart": "2020-03-26T16:15:24Z",
    "actualFinish": "2020-03-26T16:15:24Z",
    "updatedOn": "2020-03-26T16:15:24Z",
    "movedOn": "2020-03-26T16:15:24Z",
    "color": "#F1C7C5",
    "iconPath": null,
    "blockedStatus": {
        "isBlocked": true,
        "reason": "The block reason",
        "date": "2020-03-26T16:15:24Z"
    },
    "board": {
        "id": "944576308",
        "title": "Sample Board",
        "version": "42",
        "isArchived": false
    },
    "taskBoard": {
        "id": "944576305",
        "version": "8"
    },
    "customIcon": {
        "id": "944576317",
        "title": "Date Dependent",
        "cardColor": "#FFFFFF",
        "iconColor": "212121",
        "iconName": "lk_icons_final_01-13",
        "iconPath": "https://myaccount.leankit.com/customicons/24/212121/lk_icons_final_01-13.png",
        "policy": ""
    },
    "customId": {
        "value": "Card header text",
        "prefix": null,
        "url": null
    },
    "externalLinks": [
        {
            "label": "The link label",
            "url": "https://www.leankit.com"
        }
    ],
    "lane": {
        "cardLimit": 0,
        "description": null,
        "id": "944576326",
        "index": 0,
        "laneClassType": "active",
        "laneType": "ready",
        "orientation": "vertical",
        "title": "ToDo"
    },
    "type": {
        "id": "944576314",
        "title": "New Feature",
        "cardColor": "#B8CFDF"
    },
    "assignedUsers": [
        {
            "id": "478440842",
            "emailAddress": "user@leankit.com",
            "fullName": "First Last",
            "firstName": "First",
            "lastName": "Last",
            "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
        }
    ],
    "comments": [],
    "attachments": [],
    "parentCards": [],
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "firstName": "First",
        "lastName": "Last",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "updatedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "firstName": "First",
        "lastName": "Last",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "movedBy": null,
    "archivedBy": null
}
```

---
title: Create a card
public: true
repo: core-leankit-api
---
# POST /io/card/
Create a card.

_Note: `copiedFromCardId` does not copy the source card's details but will replicate the taskboard and task cards from the source card._

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`returnFullRecord`|boolean|Returns the full card record|false|

### Example Requests

#### Minimum Board
Card will be created at the end of the default drop lane with the default card type.
```json
{
  "destination": { "boardId": "1234" },
  "title": "The title of the card"
}
```

#### Minimum Lane
Card will be created at the end of the specified lane with the default card type.
```json
{
  "destination": { "laneId": "2345" },
  "title": "The title of the card"
}
```

#### Minimum Taskboard
Card will be created at the end of the "TODO" lane on the taskboard of the specified card with the default task card type.
```json
{
  "destination": { "cardId": "3456" },
  "title": "The title of the card"
}
```

#### All fields
```json
{
    "destination": { // One of the properties (boardId, laneId, cardId) is required
      "boardId": "1234",
      "laneId": "2345",
      "cardId": "3456",
      "index": 1, // default: -1 (end of lane)
      "laneTitle": "doing" // Used when destination is a card. Options: todo,doing,done; default: todo
    },
    "title": "The title of the card",
    "typeId": "944576314",
    "assignedUserIds": [ "478440842" ],
    "description": "The card description",
    "size": 1,
    "connections": {
      "parents": ["945202295"],
      "children": ["945250930"]
    },
    "dependencies": [
      {
        "cardId": "945202296",
        "direction": "incoming",
        "timing": "finishToStart" // timing is optional and defaults to finishToStart
      },
      {
        "cardId": "945202297",
        "direction": "outgoing",
        "timing": "startToStart"
      }
    ],
    "mirrorSourceCardId": "945202295",
    "copiedFromCardId": "945261794",
    "blockReason": "The block reason",
    "priority": "normal",
    "customIconId": "944576317",
    "customId": "Card header text",
    "externalLink": {
        "label": "The link label",
        "url": "https://www.leankit.com"
    },
    "plannedStart": "2020-01-20",
    "plannedFinish": "2020-02-01",
    "tags": [
        "tagOne",
        "tagTwo"
    ],
    "wipOverrideComment": "The override reason",
    "customFields": [ {
      "fieldId": "945250752",
      "value": "This is the field value"
    } ],
    "planningIncrementIds": [
        "10114179391",
        "10114169190"
    ]
}
```
__Note:__ `boardId`, `laneId`, `index` properties have been moved into the `destination` object. For backwards compatibility, when they are provided at the top level, a valid `destination` is generated.

### Example Successful Response
When returnFullRecord is false (default)

201 Created
```json
{
    "id": "945250932"
}
```

When returnFullRecord is true

201 Created
```json
{
    "actualFinish": null,
    "actualStart": null,
    "blockedStatus": {
        "isBlocked": true,
        "reason": "The block reason",
        "date": "2019-12-06T21:07:34Z"
    },
    "board": {
        "id": "944576308",
        "title": "Sample Board",
        "version": "42",
        "isArchived": false
    },
    "customIcon": {
        "id": "944576317",
        "title": "Date Dependent",
        "cardColor": "#FFFFFF",
        "iconColor": "212121",
        "iconName": "lk_icons_final_01-13",
        "iconPath": "https://myaccount.leankit.com/customicons/24/212121/lk_icons_final_01-13.png",
        "policy": ""
    },
    "customIconLabel": "Class of Service",
    "color": "#B8CFDF",
    "iconPath": null,
    "createdOn": "2019-12-06T21:07:34Z",
    "archivedOn": null,
    "description": "The card description",
    "plannedFinish": "2020-02-01",
    "customId": {
        "value": "Card header text",
        "prefix": null,
        "url": null
    },
    "externalLinks": [
        {
            "label": "The link label",
            "url": "https://www.leankit.com"
        }
    ],
    "id": "945261794",
    "index": 1,
    "lane": {
        "cardLimit": 0,
        "description": null,
        "id": "944576326",
        "index": 0,
        "laneClassType": "backlog",
        "laneType": "ready",
        "orientation": "vertical",
        "title": "New Requests",
        "taskBoard": null,
        "cardStatus": "notStarted"
    },
    "updatedOn": "2019-12-06T21:07:34Z",
    "movedOn": "2019-12-06T21:07:34Z",
    "priority": "normal",
    "size": 1,
    "plannedStart": "2020-01-20",
    "tags": [
        "tagOne",
        "tagTwo"
    ],
    "title": "The title of the card",
    "version": "2",
    "type": {
        "id": "944576314",
        "title": "New Feature",
        "cardColor": "#B8CFDF"
    },
    "taskBoardStats": null,
    "subscriptionId": "945261795",
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "updatedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "movedBy": null,
    "archivedBy": null,
    "assignedUsers": [
        {
            "id": "478440842",
            "emailAddress": "user@leankit.com",
            "fullName": "First Last",
            "firstName": "First",
            "lastName": "Last",
            "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
        }
    ],
    "attachments": [],
    "comments": [],
    "parentCards": [
        {
            "cardId": "945202295",
            "boardId": "944576308"
        }
    ],
    "mirrorSourceCardId": "945202295",
    "customFields": [
        {
            "fieldId": "945250752",
            "type": "text",
            "label": "Custom Field Label",
            "value": "This is the field value"
        }
    ],
    "connectedCardStats": {
        "startedCount": 0,
        "startedSize": 0,
        "notStartedCount": 1,
        "notStartedSize": 1,
        "completedCount": 0,
        "completedSize": 0,
        "blockedCount": 0,
        "totalCount": 1,
        "totalSize": 1,
        "plannedStart": null,
        "plannedFinish": null,
        "actualStart": null,
        "actualFinish": null,
        "pastDueCount": 0,
        "projectedLateCount": 0
    },
    "planningIncrements": [
        {
            "id": "10114179391",
            "label": "PI-1a",
            "startDate": "2021-11-01T00:00:00.000Z",
            "endDate": "2021-11-14T00:00:00.000Z",
            "series": {
                "id": "10114169089",
                "label": "Series 2",
                "timeZone": "Etc/GMT"
            },
            "parent": {
                "id": "10114169189",
                "label": "PI-1"
            }
        },
        {
            "id": "10114169190",
            "label": "PI-2",
            "startDate": "2021-12-01T00:00:00.000Z",
            "endDate": "2021-12-25T00:00:00.000Z",
            "series": {
                "id": "10114169089",
                "label": "Series 2",
                "timeZone": "Etc/GMT"
            },
            "parent": null
        }
    ]
}
```

---
title: Delete multiple cards
public: true
repo: core-leankit-api
---
# DELETE /io/card/
Delete multiple cards. All cards must be on the same board. The board setting "Allow users to delete cards" must be checked.

### Example Request
```json
{
  "cardIds": ["945197148", "945195349"]
}
```

### Example Successful Response

204 No Content

---
title: Delete a card by id
public: true
repo: core-leankit-api
---
# DELETE /io/card/:cardId
Delete a card by id. The board setting "Allow users to delete cards" must be checked.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/card/943206946 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get card details by card id
public: true
repo: core-card-service
openApi: true
---
# GET /io/card/:cardId
Get card details by card id.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`excludeComments`|boolean|Set to true to omit comments from response|false|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "actualFinish": "2019-12-05T21:52:12Z",
    "actualStart": "2019-12-05T21:52:10Z",
    "blockedStatus": {
        "isBlocked": true,
        "reason": "Blocked card reason",
        "date": "2019-12-04T20:38:33Z"
    },
    "board": {
        "id": "943188457",
        "title": "Example board",
        "version": "103",
        "isArchived": false
    },
    "customIcon": {
        "id": "943188468",
        "title": "Regulatory",
        "cardColor": "#FFFFFF",
        "iconColor": "49bbd6",
        "iconName": "lk_icons_final_05-11",
        "iconPath": "https://myaccount.leankit.com/customicons/24/49bbd6/lk_icons_final_05-11.png",
        "policy": ""
    },
    "customIconLabel": "Class of Service",
    "color": "#B8CFDF",
    "iconPath": null,
    "createdOn": "2019-12-03T23:27:44Z",
    "archivedOn": null,
    "description": "<p>The card three description</p>",
    "plannedFinish": "2019-12-23",
    "customId": {
        "value": "The card header text",
        "prefix": null,
        "url": null
    },
    "externalLinks": [
        {
            "label": "Link Title",
            "url": "https://www.leankit.com"
        }
    ],
    "id": "943206946",
    "index": 1,
    "lane": {
        "cardLimit": 0,
        "description": null,
        "id": "943188473",
        "index": 3,
        "laneClassType": "active",
        "laneType": "completed",
        "orientation": "vertical",
        "title": "Recently Finished",
        "taskBoard": null,
        "cardStatus": "finished"
    },
    "updatedOn": "2019-12-05T21:52:12Z",
    "movedOn": "2019-12-05T21:52:12Z",
    "priority": "high",
    "size": 2,
    "plannedStart": "2019-12-20",
    "tags": [
        "tagone",
        "tagtwo"
    ],
    "title": "Card Three",
    "version": "26",
    "type": {
        "id": "943188463",
        "title": "New Feature",
        "cardColor": "#B8CFDF"
    },
    "taskBoardStats": {
        "totalCount": 2,
        "completedCount": 1,
        "totalSize": 2,
        "completedSize": 1
    },
    "subscriptionId": "943850307",
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "updatedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "movedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "archivedBy": null,
    "assignedUsers": [
        {
            "id": "478440842",
            "emailAddress": "user@leankit.com",
            "fullName": "First Last",
            "firstName": "First",
            "lastName": "Last",
            "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25",

        }
    ],
    "assignedTeams": [
        {
            "id": "478440889",
            "title": "Team A",
            "hasAccess": true,
            "addedOn": "2020-08-08T12:59:59.027Z"
        }
    ],
    "attachments": [
        {
            "id": "943837391",
            "attachmentSize": 13,
            "createdBy": {
                "id": "478440842",
                "emailAddress": "user@leankit.com",
                "fullName": "First Last",
                "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
            },
            "changedBy": null,
            "createdOn": "2019-12-04T20:38:18Z",
            "updatedOn": "2019-12-04T20:38:18Z",
            "description": "Sample file description",
            "name": "sample.txt",
            "storageId": "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxx"
        }
    ],
    "commentsCount": 1,
    "childCommentsCount": 0,
    "planningIncrements": [
      {
        "id": "94385077777",
        "label": "Child Planning Increment 1",
        "startDate": "2022-01-01T00:00:00Z",
        "endDate": "2022-06-01T00:00:00Z",
        "series": {
            "id": "94385077775",
            "label": "Series With Boards",
            "timeZone": "Etc/GMT"
        },
        "parent": {
            "id": "94385077776",
            "label": "Higher Level Increment"
        }
      },
      {
        "id": "94385077888",
        "label": "Child Planning Increment 2",
        "startDate": "2022-07-01T00:00:00Z",
        "endDate": "2022-10-01T00:00:00Z",
        "series": {
            "id": "94385077775",
            "label": "Series With Boards",
            "timeZone": "Etc/GMT"
        },
        "parent": {
            "id": "94385077776",
            "label": "Higher Level Increment"
        }
      }
    ],
    "comments": [
        {
            "id": "943867019",
            "createdOn": "2019-12-04T20:37:23Z",
            "createdBy": {
                "id": "478440842",
                "emailAddress": "user@leankit.com",
                "fullName": "First Last",
                "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
            },
            "text": "<p>This is a sample comment</p>"
        }
    ],
    "parentCards": [
        {
            "cardId": "943926922",
            "boardId": "943188457"
        },
        {
            "cardId": "943941780",
            "boardId": "943926001"
        }
    ],
    "customFields": [
        {
            "fieldId": "943852689",
            "type": "text",
            "label": "Sample Label",
            "value": "Sample custom field value"
        }
    ],
    "scoring": {
        "isTemplateChanged": false,
        "scoreTotal": null,
        "scoreOverride": 99,
        "confidenceTotal": null,
        "scores": [
            {
                "metricId": "5",
                "score": 45.21,
                "confidence": 22.12
            },
            {
                "metricId": "6",
                "score": 88.35,
                "confidence": 90.09
            }
        ]
    },
    "connectedCardStats": {
        "startedCount": 2,
        "startedSize": 2,
        "notStartedCount": 1,
        "notStartedSize": 1,
        "completedCount": 1,
        "completedSize": 2,
        "blockedCount": 1,
        "totalCount": 4,
        "totalSize": 5,
        "plannedStart": "2019-12-05",
        "plannedFinish": "2019-12-11",
        "actualStart": "2019-12-04T20:26:34Z",
        "actualFinish": null,
        "pastDueCount": 0,
        "projectedLateCount": 0
    }
}
```
---
title: Get a list of cards using POST
public: true
repo: core-leankit-api
---
# POST /io/card/list
Get a list of cards.

See also: [GET /io/card](/markdown/card/list.md) for the GET version of this request.

### Request Body Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned|0|
|`limit`|integer|Set the number of cards to be returned|200|
|`select`|enumeration|Only return <br /> `cards`<br /> `taskCards`<br /> `both`|cards|
|`board`|string|Filter to the specified board||
|`lanes`|string[]|Filter to the specified array of lane ids||
|`cards`|string[]|Filter to the specified array of card ids||
|`search`|string|Full text search on card title and external card id||
|`customId`|string|Filter using external card id (header). This field is deprecated, please use `customIds`.||
|`customIds`|string[]|Filter using the external card ids (headers)||
|`type`|string|Filter using the card type id. This field is deprecated, please use `types`.||
|`types`|string[]|Filter using the card type ids||
|`assignedUserIds`|string[]|Filter using the assigned user ids||
|`custom_icon`|string|Filter using custom icon id||
|`lane_class_types`|string[]|Only return cards in lane class types specified by array. Options are <br /> `backlog`<br /> `active`<br /> `archive`.
|`since`|datetime|Only return cards updated after this ISO8601 date||
|`deleted`|boolean|Return the card ids for deleted cards|
|`only`|string[]|Return only the fields specified by array||
|`omit`|string[]|Return all fields except those specified by array||
|`sort`|enumeration|Sort results by <br /> `activity`<br /> `rank`<br /> `title`<br /> Defaults to rank if there is a `search` param, otherwise activity.
|`include`|string[]|Include additional data. The possible options are: `customFields`, `parentCards`, `connectedCardStats`, `externalAssociations` and `dependencies`.||

### Example JSON Body Payloads
Get cards for a specific board
```json
{
  "board": "943188457"
}
```
Get cards for a set of lanes
```json
{
  "lanes": [ "943188474", "943188479"]
}
```
Get cards and task cards with the word "three" in the title or external card id field
```json
{
  "search": "three",
  "select": "both"
}
```
Get cards with the specified card type and custom icon in active or backlog lanes
```json
{
  "custom_icon": "943188468",
  "type": "943188463",
  "lane_class_types": [ "active", "backlog"]
}
```
Get the id and title of cards updated since 2019-12-05T21:52:12Z sorted by title
```json
{
  "since": "2019-12-05T21:52:12Z",
  "only": [ "title", "id" ],
  "sort": "title"
}
```
Get specific cards by id
```json
{
  "cards": [ "123456", "43212", "987656" ]
}
```


### Example Successful Response

200 Success
```json
{
    "cards": [
        {
            "assignedUsers": [
                {
                    "id": "478440842",
                    "fullName": "First Last",
                    "emailAddress": "user@leankit.com",
                    "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
                }
            ],
            "assignedTeams": [],
            "id": "943206946",
            "index": 1,
            "version": "26",
            "title": "Card Three",
            "description": "<p>The card three description</p>",
            "priority": "high",
            "size": 2,
            "plannedStart": "2019-12-20",
            "plannedFinish": "2019-12-23",
            "actualFinish": "2019-12-05T21:52:12Z",
            "actualStart": "2019-12-05T21:52:10Z",
            "createdOn": "2019-12-03T23:27:44Z",
            "archivedOn": null,
            "updatedOn": "2019-12-05T21:52:12Z",
            "movedOn": "2019-12-05T21:52:12Z",
            "tags": [
                "tagone",
                "tagtwo"
            ],
            "containingCardId": null,
            "color": "#B8CFDF",
            "iconPath": null,
            "customIconLabel": "Class of Service",
            "customIcon": {
                "id": "943188468",
                "title": "Regulatory",
                "cardColor": "#FFFFFF",
                "iconColor": "49bbd6",
                "iconName": "lk_icons_final_05-11",
                "iconPath": "https://myaccount.leankit.com/customicons/24/49bbd6/lk_icons_final_05-11.png"
            },
            "blockedStatus": {
                "isBlocked": true,
                "reason": "Blocked card reason",
                "date": "2019-12-04T20:38:33Z"
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "103",
                "isArchived": false
            },
            "customId": {
                "value": "The card header text",
                "prefix": null,
                "url": null
            },
            "externalLinks": [
                {
                    "label": "Link Title",
                    "url": "https://www.leankit.com"
                }
            ],
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188473",
                "index": 3,
                "laneClassType": "active",
                "laneType": "completed",
                "orientation": "vertical",
                "title": "Recently Finished",
                "taskBoard": null,
                "cardStatus": "finished"
            },
            "type": {
                "id": "943188463",
                "title": "New Feature",
                "cardColor": "#B8CFDF"
            },
            "taskBoardStats": {
                "totalCount": 2,
                "completedCount": 1,
                "totalSize": 2,
                "completedSize": 1
            },
            "planningIncrements": [
              {
                "id": "350",
                "label": "PI-3"
              },
              {
                "id": "375",
                "label": "PI-4"
              }
            ],
            "customFields": [
                {
                    "id": "5355212",
                    "value": "abc"
                },
                {
                    "id": "5355213",
                    "value": "123"
                }
            ],
            "dependencies": {
              "incoming": [
                {
                  "cardId": "5259070",
                  "timing": "finishToFinish",
                  "createdOn": "2025-08-05T16:09:27.310Z",
                  "boardId": "4322217"
                }
              ],
              "outgoing": [
                {
                  "cardId": "5258472",
                  "timing": "finishToStart",
                  "createdOn": "2025-07-24T14:24:23.680Z",
                  "boardId": "4693321"
                }
              ]
            }
        },
        {
            "assignedUsers": [],
            "assignedTeams": [
                {
                    "id": "5051621",
                    "title": "Team A"
                }
            ],
            "id": "944509659",
            "index": 1,
            "version": "3",
            "title": "2",
            "description": null,
            "priority": "normal",
            "size": 0,
            "plannedStart": null,
            "plannedFinish": null,
            "actualFinish": null,
            "actualStart": "2019-12-05T15:48:02Z",
            "createdOn": "2019-12-05T15:48:02Z",
            "archivedOn": null,
            "updatedOn": "2019-12-05T17:39:52Z",
            "movedOn": "2019-12-05T15:48:02Z",
            "tags": [],
            "containingCardId": null,
            "color": "#FFFFFF",
            "iconPath": null,
            "customIconLabel": "Class of Service",
            "customIcon": null,
            "blockedStatus": {
                "isBlocked": false,
                "reason": null,
                "date": null
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "103",
                "isArchived": false
            },
            "customId": {
                "value": null,
                "prefix": null,
                "url": null
            },
            "externalLinks": [],
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188472",
                "index": 1,
                "laneClassType": "active",
                "laneType": "inProcess",
                "orientation": "vertical",
                "title": "Doing Now",
                "taskBoard": null,
                "cardStatus": "started"
            },
            "type": {
                "id": "943188459",
                "title": "Other Work",
                "cardColor": "#FFFFFF"
            },
            "taskBoardStats": null,
            "planningIncrements": [],
            "customFields": [],
            "dependencies": {
              "incoming": [],
              "outgoing": []
            }
        }
    ],
    "pageMeta": {
        "totalRecords": 668,
        "offset": 0,
        "limit": 2,
        "startRow": 1,
        "endRow": 2
    },
    "inaccessibleCards": [
      {
        "id": "1014559398",
        "isDeleted": true,
        "hasAccess": true
      }
    ]
}

Note:
"inaccessibleCards" is included only when requesting specific cards by id using the `cards` property.
"customFields" are included only when requesting with the `include` parameter.

```
| Status Code              | Error Message     | Reason                                 |
|--------------------------|-------------------|----------------------------------------|
| `422 Unprocessable Entity` | Invalid request: Failed \"enum\" criteria (pointer: #/select) | One of the query properties doesn't match a valid value. e.g. `"select": "taskcard"` is not valid but `"select": "taskCards"` is valid |
---
title: Get a list of task cards for a card
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/tasks
Get a list of task cards for a card.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|20|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/945202295/tasks \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 2
    },
    "cards": [
        {
            "id": "945233520",
            "title": "task one",
            "index": 0,
            "laneId": "945233517",
            "color": "#FFF8DF",
            "tags": [],
            "size": 0,
            "priority": "normal",
            "plannedStart": null,
            "plannedFinish": null,
            "actualStart": null,
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2019-12-06T20:11:03.013Z",
            "updatedOn": "2019-12-06T20:11:03.013Z",
            "externalLinks": [],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null
            },
            "customIcon": null,
            "customHeader": {
                "value": null,
                "header": null,
                "url": null
            },
            "customId": {
                "value": null,
                "prefix": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": "945202295",
            "cardType": {
                "id": "944576316",
                "name": "Subtask"
            },
            "subscriptionId": null,
            "parentCards": [],
            "assignedUsers": [],
            "connectedCardStats": null,
            "canView": true
        },
        {
            "id": "945237610",
            "title": "task two",
            "index": 0,
            "laneId": "945233519",
            "color": "#FFF8DF",
            "tags": [
                "tagone",
                "tagtwo"
            ],
            "size": 2,
            "priority": "critical",
            "plannedStart": "2019-12-03",
            "plannedFinish": "2019-12-21",
            "actualStart": "2019-12-06T20:11:17Z",
            "actualFinish": "2019-12-06T20:11:17Z",
            "isDone": true,
            "movedOn": "2019-12-06T20:11:17.510Z",
            "updatedOn": "2019-12-06T20:12:27.000Z",
            "externalLinks": [
                {
                    "label": "External Link Title",
                    "url": "http://www.leankit.com"
                }
            ],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": true,
                "reason": "This task is blocked"
            },
            "customIcon": null,
            "customHeader": {
                "value": "This is a task header",
                "header": "This is a task header",
                "url": null
            },
            "customId": {
                "value": "This is a task header",
                "prefix": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": "945202295",
            "cardType": {
                "id": "944576316",
                "name": "Subtask"
            },
            "subscriptionId": "945194554",
            "parentCards": [],
            "assignedUsers": [
                {
                    "id": "478440842",
                    "fullName": "First Last",
                    "avatar": "https://myaccount.leankit.com/avatar/show/478440842/?s=25",
                    "emailAddress": "user@leankit.com"
                }
            ],
            "connectedCardStats": null,
            "canView": true
        }
    ]
}
```
---
title: Get a list of cards
public: true
repo: core-leankit-api
openApi: true
operationId: listCards
---
# GET /io/card/
Get a list of cards.

See also: [POST /io/card/list](/markdown/card/list-cards.md) for requests using a JSON body to define filters.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned|0|
|`limit`|integer|Set the number of cards to be returned|200|
|`select`|enumeration|Only return <br /> `cards`<br /> `taskCards`<br /> `both`|cards|
|`board`|string|Filter to the specified board||
|`lanes`|string|Filter to the specified comma separated lane ids||
|`cards`|string|Filter to the specified comma separated card ids||
|`search`|string|Full text search on card title and external card id||
|`customId`|string|Filter using external card id (header). This field is deprecated, please use `customIds`.||
|`customIds`|string|Filter to the specified comma separated external card ids (headers)||
|`type`|string|Filter using the card type id. This field is deprecated, please use `types`.||
|`types`|string|Filter to the specified comma separated card type ids||
|`assignedUserIds`|string|Filter to the specified comma separated assigned user ids||
|`custom_icon`|string|Filter using custom icon id||
|`lane_class_types`|string|Only return cards in lane class types specified in a csv list. Options are <br /> `backlog`<br /> `active`<br /> `archive`.
|`since`|datetime|Only return cards updated after this ISO8601 date||
|`deleted`|boolean|Return the card ids for deleted cards|
|`only`|string|Return only the fields specified in a csv list||
|`omit`|string|Return all fields except the ones specified in a csv list||
|`sort`|enumeration|Sort results by <br /> `activity`<br /> `rank`<br /> `title`<br /> Defaults to rank if there is a `search` param, otherwise activity.
|`include`|string|Include additional data. The possible options are: `customFields`, `parentCards`, `connectedCardStats`, `externalAssociations` and `dependencies`. Value is a csv list||

### Example Request
Get cards across all boards
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card \
  -H 'Authorization: Basic base64encodedauthhere'
```

Get cards for a specific board
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?board=943188457 \
  -H 'Authorization: Basic base64encodedauthhere'
```
Get cards for a set of lanes
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?lanes=943188474,943188479 \
  -H 'Authorization: Basic base64encodedauthhere'
```
Get cards and task cards with the word "three" in the title or external card id field
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?search=three&select=both \
  -H 'Authorization: Basic base64encodedauthhere'
```
Get cards with the specified card type and custom icon in active or backlog lanes
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?custom_icon=943188468&type=943188463&lane_class_types=active,backlog \
  -H 'Authorization: Basic base64encodedauthhere'
```
Get the id and title of cards updated since 2019-12-05T21:52:12Z sorted by title
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?since=2019-12-05T21:52:12Z&only=title,id&sort=title \
  -H 'Authorization: Basic base64encodedauthhere'
```
Get specific cards by id
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card?cards=123456,43212,987656 \
  -H 'Authorization: Basic base64encodedauthhere'
```


### Example Successful Response

200 Success
```json
{
    "cards": [
        {
            "assignedUsers": [
                {
                    "id": "478440842",
                    "fullName": "First Last",
                    "emailAddress": "user@leankit.com",
                    "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
                }
            ],
            "assignedTeams": [],
            "id": "943206946",
            "index": 1,
            "version": "26",
            "title": "Card Three",
            "description": "<p>The card three description</p>",
            "priority": "high",
            "size": 2,
            "plannedStart": "2019-12-20",
            "plannedFinish": "2019-12-23",
            "actualFinish": "2019-12-05T21:52:12Z",
            "actualStart": "2019-12-05T21:52:10Z",
            "createdOn": "2019-12-03T23:27:44Z",
            "archivedOn": null,
            "updatedOn": "2019-12-05T21:52:12Z",
            "movedOn": "2019-12-05T21:52:12Z",
            "tags": [
                "tagone",
                "tagtwo"
            ],
            "containingCardId": null,
            "color": "#B8CFDF",
            "iconPath": null,
            "customIconLabel": "Class of Service",
            "customIcon": {
                "id": "943188468",
                "title": "Regulatory",
                "cardColor": "#FFFFFF",
                "iconColor": "49bbd6",
                "iconName": "lk_icons_final_05-11",
                "iconPath": "https://myaccount.leankit.com/customicons/24/49bbd6/lk_icons_final_05-11.png"
            },
            "blockedStatus": {
                "isBlocked": true,
                "reason": "Blocked card reason",
                "date": "2019-12-04T20:38:33Z"
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "103",
                "isArchived": false
            },
            "customId": {
                "value": "The card header text",
                "prefix": null,
                "url": null
            },
            "externalLinks": [
                {
                    "label": "Link Title",
                    "url": "https://www.leankit.com"
                }
            ],
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188473",
                "index": 3,
                "laneClassType": "active",
                "laneType": "completed",
                "orientation": "vertical",
                "title": "Recently Finished",
                "taskBoard": null,
                "cardStatus": "finished"
            },
            "type": {
                "id": "943188463",
                "title": "New Feature",
                "cardColor": "#B8CFDF"
            },
            "taskBoardStats": {
                "totalCount": 2,
                "completedCount": 1,
                "totalSize": 2,
                "completedSize": 1
            },
            "planningIncrements": [
              {
                "id": "350",
                "label": "PI-3"
              },
              {
                "id": "375",
                "label": "PI-4"
              }
            ],
            "customFields": [
                {
                    "id": "5355212",
                    "value": "abc"
                },
                {
                    "id": "5355213",
                    "value": "123"
                }
            ],
            "dependencies": {
              "incoming": [
                {
                  "cardId": "5259070",
                  "timing": "finishToFinish",
                  "createdOn": "2025-08-05T16:09:27.310Z",
                  "boardId": "4322217"
                }
              ],
              "outgoing": [
                {
                  "cardId": "5258472",
                  "timing": "finishToStart",
                  "createdOn": "2025-07-24T14:24:23.680Z",
                  "boardId": "4693321"
                }
              ]
            }
        },
        {
            "assignedUsers": [],
            "assignedTeams": [
                {
                    "id": "5051621",
                    "title": "Team A"
                }
            ],
            "id": "944509659",
            "index": 1,
            "version": "3",
            "title": "2",
            "description": null,
            "priority": "normal",
            "size": 0,
            "plannedStart": null,
            "plannedFinish": null,
            "actualFinish": null,
            "actualStart": "2019-12-05T15:48:02Z",
            "createdOn": "2019-12-05T15:48:02Z",
            "archivedOn": null,
            "updatedOn": "2019-12-05T17:39:52Z",
            "movedOn": "2019-12-05T15:48:02Z",
            "tags": [],
            "containingCardId": null,
            "color": "#FFFFFF",
            "iconPath": null,
            "customIconLabel": "Class of Service",
            "customIcon": null,
            "blockedStatus": {
                "isBlocked": false,
                "reason": null,
                "date": null
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "103",
                "isArchived": false
            },
            "customId": {
                "value": null,
                "prefix": null,
                "url": null
            },
            "externalLinks": [],
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188472",
                "index": 1,
                "laneClassType": "active",
                "laneType": "inProcess",
                "orientation": "vertical",
                "title": "Doing Now",
                "taskBoard": null,
                "cardStatus": "started"
            },
            "type": {
                "id": "943188459",
                "title": "Other Work",
                "cardColor": "#FFFFFF"
            },
            "taskBoardStats": null,
            "planningIncrements": [],
            "customFields": [],
            "dependencies": {
              "incoming": [],
              "outgoing": []
            }
        }
    ],
    "pageMeta": {
        "totalRecords": 668,
        "offset": 0,
        "limit": 2,
        "startRow": 1,
        "endRow": 2
    },
    "inaccessibleCards": [
      {
        "id": "1014559398",
        "isDeleted": true,
        "hasAccess": true
      }
    ]
}

Note:
"inaccessibleCards" is included only when requesting specific cards by id using the `cards` querystring parameter.
"customFields" are included only when requesting with the `include` parameter.

```
| Status Code              | Error Message     | Reason                                 |
|--------------------------|-------------------|----------------------------------------|
| `422 Unprocessable Entity` | Invalid request: Failed \"enum\" criteria (pointer: #/select) | One of the query parameters doesn't match a valid value. e.g. `select=taskcard` is not valid but `select=taskCards` is valid |
---
title: Move a card
public: true
repo: core-card-service
---
# POST /io/card/move
This API has a number of uses:
* Move cards between lanes
* Change a card's index in a lane
* Move task cards between task lanes
* Convert a card to a task
* Convert a task to a card
* Move cards to other boards

### Example Requests:
Moving a single card to the end of another lane
```json
{
  "cardIds":["637797483"],
  "destination":{
      "laneId": "637797516"
  }
}
```
Moving a card to a specific index

_Note: Avoid using a specific index if possible. Operations that explicitly modify index are slower._
```json
{
  "cardIds":["637797483"],
  "destination":{
      "laneId": "637797516",
      "index": 2
  }
}
```
Moving multiple cards to the default drop lane on another board
```json
{
  "cardIds":["637797483", "8675309"],
  "destination":{
      "boardId": "90210"
  }
}
```
Converting a card to a task
```json
{
  "cardIds":["637797483"],
  "destination":{
      "cardId": "637797516"
  }
}
```

### Example Success Response
200 OK
```
{}
```

---
title: Subscribe to card(s)
public: false
repo: core-card-service
---

# PUT /io/card/subscribe

Subscribe to one or more cards.

### Example Request:

```json
{
  "cardIds": ["1", "2", "3"]
}
```

### Example Successful Response

202 Accepted
---
title: Unsubscribe from card(s)
public: false
repo: core-card-service
---

# DELETE /io/card/subscribe

Unsubscribe from one or more cards.

### Example Request:

```json
{
  "cardIds": ["1", "2", "3"]
}
```

### Example Successful Response

204 No Content
---
title: Get taskboard lanes for a card
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/taskboard
Get taskboard lanes for a card.


### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/taskboard \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "lanes": [
        {
            "id": "945233517",
            "name": "ToDo",
            "description": null,
            "cardLimit": 0,
            "creationDate": "2019-12-06T20:11:02.993Z",
            "index": 0,
            "boardId": "944576308",
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "columns": 2,
            "cardCount": 1,
            "cardSize": 1,
            "laneClassType": "active",
            "laneType": "ready",
            "cardStatus": "notStarted",
            "wipLimit": 0,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "isCollapsed": false,
            "archiveCardCount": 0,
            "subscriptionId": null
        },
        {
            "id": "945233518",
            "name": "Doing",
            "description": null,
            "cardLimit": 0,
            "creationDate": "2019-12-06T20:11:02.993Z",
            "index": 1,
            "boardId": "944576308",
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "columns": 1,
            "cardCount": 0,
            "cardSize": 0,
            "laneClassType": "active",
            "laneType": "inProcess",
            "cardStatus": "started",
            "wipLimit": 0,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "isCollapsed": false,
            "archiveCardCount": 0,
            "subscriptionId": null
        },
        {
            "id": "945233519",
            "name": "Done",
            "description": null,
            "cardLimit": 0,
            "creationDate": "2019-12-06T20:11:02.993Z",
            "index": 2,
            "boardId": "944576308",
            "parentLaneId": null,
            "activityId": null,
            "orientation": "vertical",
            "columns": 2,
            "cardCount": 1,
            "cardSize": 2,
            "laneClassType": "active",
            "laneType": "completed",
            "cardStatus": "finished",
            "wipLimit": 0,
            "isConnectionDoneLane": false,
            "isDefaultDropLane": false,
            "isCollapsed": false,
            "archiveCardCount": 0,
            "subscriptionId": null
        }
    ]
}
```
---
title: Update a card
public: true
repo: core-card-service
---
# PATCH /io/card/:cardId
Update a card's fields. This endpoint supports [ISO 6902 JSON Patch](https://tools.ietf.org/html/rfc6902). Concurrency checks are implemented via a version number that may be specified either in an `x-lk-resource-version` header or in a json patch `test` operation against path `/version` in the body. If no version number is specified, the concurrency check will be skipped.

### Operations
| Operation | Description |
|---|---|
|`replace`|Update the field value.|
|`add`|Add the field value. `replace` and `add` are interchangeable in many cases. |
|`remove`|Remove the field value.|
|`test`|Check the field value for a match. This is most commonly used with `version` to handle concurrency issues.|

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `title` |string| The card title. ||
| `typeId` |string| The card type. ||
| `assignedUserIds` |string array| Collection of assigned users. ||
| `blockReason` |string| The block reason. This should be specified with the `isBlocked` property operation in the same request. ||
| `customIconId` |string| The custom icon. ||
| `customId` |string| The card header. ||
| `customFields` |object array| Collection of custom fields. Each field has a string `fieldId` and string `value` property. ||
| `description` |string| The card description ||
| `externalLink` |object| External link object with string `label` and string `url` fields. ||
| `index` |integer| The position of the card in the lane starting at 0 as the first position. ||
| `isBlocked` |boolean| The blocked state of the card. Should be specified with the `blockReason` property operation in the same request. ||
| `laneId` |string| The lane id that the card should be moved to. ||
| `parentCardId` |string| The parent card. ||
| `plannedStart` |date| The planned start date in the format YYYY-MM-DD ||
| `plannedFinish` |date| The planned finish date in the format YYYY-MM-DD. ||
| `planningIncrementIds` |string array| Collection of planning increment ids.||
| `mirrorSourceCardId` |string| The card that is the source for mirroring title, description and customId to this card. ||
| `size` |string| The card size. ||
| `tags` |string array| Collection of tags. ||
| `wipOverrideComment` |string| The WIP override comment. This should be specified with a `laneId` update operation that would violate a WIP limit. ||
| `version` |string| The card version. This can not be set. It is used with a `test` operation to validate that the card was not modified. ||

### Example Request
Updating a single field
```json
[
  { "op": "replace", "path": "/title", "value": "updated card title" }
]
```
Change two fields at once
```json
[
  { "op": "replace", "path": "/description", "value": "updated card description" },
  { "op": "replace", "path": "/typeId", "value": "944576315" }
]
```
All fields that can be updated
```json
[
  { "op": "replace", "path": "/title", "value": "Title here" },
  { "op": "replace", "path": "/typeId", "value": "944576315" },
  { "op": "add", "path": "/assignedUserIds/1", "value": "583458214" },
  { "op": "add", "path": "/blockReason", "value": "This card is blocked" },
  { "op": "replace", "path": "/customIconId", "value": "944576318" },
  { "op": "replace", "path": "/customId", "value": "The header" },
  { "op": "add", "path": "/customFields/0", "value": {
  	"fieldId": "945250752",
  	"value": "Custom field value"
  } },
  { "op": "replace", "path": "/description", "value": "The description" },
  { "op": "add", "path": "/externalLink", "value": {
  	"label": "Link label",
  	"url": "https://www.leankit.com"
  } },
  { "op": "replace", "path": "/index", "value": 0 },
  { "op": "replace", "path": "/isBlocked", "value": true },
  { "op": "replace", "path": "/laneId", "value": "944576328" },
  { "op": "replace", "path": "/parentCardId", "value": "945265884" },
  { "op": "replace", "path": "/plannedStart", "value": "2024-01-01" },
  { "op": "replace", "path": "/plannedFinish", "value": "2024-12-31" },
  { "op": "remove", "path": "/mirrorSourceCardId", "value": "945265884" },
  { "op": "replace", "path": "/size", "value": 5 },
  { "op": "remove", "path": "/tags/0" },
  { "op": "replace", "path": "/wipOverrideComment", "value": "Override wip" },
  { "op": "add", "path": "/planningIncrementIds/-", "value": "94114176565" }
  { "op": "test", "path": "/version", "value": "11" }
]
```
Verify the card hasn't changed before updating the custom header id. If the version specified in the test operation does not match the server version a http `428 Unknown` response will be returned with the message `Optimistic concurrency check failed`.
```json
[
  { "op": "test", "path": "/version", "value": "8"  },
  { "op": "replace", "path": "/customId", "value": "new card header"  }
]

```
### Working With Collections

This example removes the first tag. Positions start at 0.
```json
[
  { "op": "remove", "path": "/tags/0" }
]
```
This example removes a tag by value. It will remove the tag `"red"`, regardless of where it appears in the tag list.
```json
[
  { "op": "remove", "path": "/tags", "value": "red"}
]
```
Specifying `-` as the position adds an item to the end of the collection.
```json
[
  { "op": "add", "path": "/tags/-", "value": "end tag" }
]
```
Edit the tag in the second position.
```json
[
  { "op": "replace", "path": "/tags/1", "value": "edit tag" }
]
```

### Example Successful Response
200 OK
```json
{
    "actualFinish": "2019-12-06T21:25:45Z",
    "actualStart": "2019-12-06T21:25:45Z",
    "blockedStatus": {
        "isBlocked": true,
        "reason": "The block reason",
        "date": "2019-12-06T21:07:34Z"
    },
    "board": {
        "id": "944576308",
        "title": "Sample Board",
        "version": "65",
        "isArchived": false
    },
    "customIcon": {
        "id": "944576317",
        "title": "Date Dependent",
        "cardColor": "#FFFFFF",
        "iconColor": "212121",
        "iconName": "lk_icons_final_01-13",
        "iconPath": "https://myaccount.leankit.com/customicons/24/212121/lk_icons_final_01-13.png",
        "policy": ""
    },
    "customIconLabel": "Class of Service",
    "color": "#B8CFDF",
    "iconPath": null,
    "createdOn": "2019-12-06T21:07:34Z",
    "archivedOn": null,
    "description": "The card description",
    "plannedFinish": null,
    "customId": {
        "value": "Card header text",
        "prefix": null,
        "url": null
    },
    "externalLinks": [
        {
            "label": "The link label",
            "url": "https://www.leankit.com"
        }
    ],
    "id": "945261794",
    "index": 2,
    "lane": {
        "cardLimit": 0,
        "description": null,
        "id": "944576330",
        "index": 2,
        "laneClassType": "active",
        "laneType": "inProcess",
        "orientation": "vertical",
        "title": "Under Review",
        "taskBoard": null,
        "cardStatus": "started"
    },
    "updatedOn": "2019-12-06T22:50:32Z",
    "movedOn": "2019-12-06T21:37:11Z",
    "priority": "normal",
    "size": 1,
    "plannedStart": null,
    "tags": [
        "tagOne",
        "tagTwo"
    ],
    "title": "updated card title",
    "version": "8",
    "type": {
        "id": "944576314",
        "title": "New Feature",
        "cardColor": "#B8CFDF"
    },
    "taskBoardStats": {
        "totalCount": 1,
        "completedCount": 0,
        "totalSize": 1,
        "completedSize": 0
    },
    "subscriptionId": "945261795",
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "updatedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "movedBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "archivedBy": null,
    "assignedUsers": [
        {
            "id": "478440842",
            "emailAddress": "user@leankit.com",
            "fullName": "First Last",
            "firstName": "First",
            "lastName": "Last",
            "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
        }
    ],
    "attachments": [],
    "comments": [],
    "parentCards": [
        {
            "cardId": "945202295",
            "boardId": "944576308"
        }
    ],
    "mirrorSourceCardId": "945265884",
    "customFields": [
        {
            "fieldId": "945250752",
            "type": "text",
            "label": "Custom Field Label",
            "value": "This is the field value"
        }
    ],
    "planningIncrements": [
        {
          "id": "94114176565",
          "label": "PI-2",
          "startDate": "2021-12-01T00:00:00.000Z",
          "endDate": "2021-12-25T00:00:00.000Z",
          "series": {
              "id": "94114169089",
              "label": "Series 1",
              "timeZone": "Etc/GMT"
          },
          "parent": null
      }
    ],
    "connectedCardStats": {
        "startedCount": 0,
        "startedSize": 0,
        "notStartedCount": 1,
        "notStartedSize": 1,
        "completedCount": 0,
        "completedSize": 0,
        "blockedCount": 0,
        "totalCount": 1,
        "totalSize": 1,
        "plannedStart": null,
        "plannedFinish": null,
        "actualStart": null,
        "actualFinish": null,
        "pastDueCount": 0,
        "projectedLateCount": 0
    }
}
```
### Notable Error Responses
| Status Code              | Error Message     | Reason                                 |
|--------------------------|-------------------|----------------------------------------|
| `428 Unknown` | Optimistic concurrency check failed | A version test operation was sent and failed because the card was modified by another transaction. |
---
title: List card faces
preview: true
public: false
repo: core-card-service
---
# GET /io/cardface/
Get cards on a board. This is used to populate the card faces when loading a LeanKit board.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`board`|string|(required) The board for which to get card faces.||
|`lanes`|string|Specify a comma-delimited list of lane Ids to limit the result to these lanes.||
|`cards`|string|Specify a comma-delimited list of card Ids to limit the result to these cards only.||
|`ignoreArchiveDate`|boolean|Set to 'true' to include cards that have already been archived and would not normally appear on the board.|false|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|

### Example Request
```shell
curl -X GET \
  https://acmeco.leankit.com/io/cardface?board=10100193219&limit=10&lanes=10106271134,10112558841' \
  -H 'Authorization: Basic ZGFuaEBwbGFudmlldy4jb206dGVzdDEyMzQ=' \
  -H 'Content-Type: application/json' \
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 18,
        "offset": 0,
        "limit": 10,
        "startRow": 1,
        "endRow": 10
    },
    "cards": [
        {
            "id": "10105790505",
            "title": "Title for 10105790505",
            "index": 1,
            "laneId": "10106271134",
            "boardId": "10100193219",
            "color": "#9AB6FD",
            "tags": [
                "Tag1"
            ],
            "size": 2,
            "priority": "high",
            "plannedStart": "2019-11-25",
            "plannedFinish": "2019-11-27",
            "actualStart": "2015-09-08T21:36:37Z",
            "actualFinish": null,
            "archivedOn": null,
            "isDone": false,
            "createdOn": "2015-12-01T12:22:34.000Z",
            "movedOn": "2015-12-09T23:27:48.000Z",
            "updatedOn": "2019-11-26T21:33:32.000Z",
            "externalLinks": [
                {
                    "label": "LeanKit",
                    "url": "http://leankit.com/"
                }
            ],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null
            },
            "customIcon": null,
            "customHeader": {
                "value": "Sample Card",
                "header": "Sample Card",
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "10100191335",
                "name": "CardType for 10100191335"
            },
            "subscriptionId": null,
            "scoring": {
              "confidenceTotal": 33.5,
              "scoreOverride": 76,
              "scoreTotal": 43.1,
              "isTemplateChanged": false,
              "scores": [
                  {
                      "metricId": "1",
                      "score": 27.1,
                      "confidence": 45.7
                  },
                  {
                      "metricId": "2",
                      "score": 88.1,
                      "confidence": 98.7
                  }
              ],
            },
            "parentCards": [],
            "assignedUsers": [],
            "connectedCardStats": {
                "startedCount": 2,
                "startedSize": 2,
                "notStartedCount": 0,
                "notStartedSize": 0,
                "completedCount": 1,
                "completedSize": 1,
                "blockedCount": 0,
                "totalCount": 3,
                "totalSize": 3,
                "plannedStart": null,
                "plannedFinish": null,
                "actualStart": "2019-11-26T16:43:34Z",
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0
            },
            "customFields": {
                "943852689": "Custom Field value",
                "10113041726": "Another value"
            },
            "planningIncrementIds": [
              "10114179392",
              "10114179393"
            ],
            "dependencyStats": {
              "incomingCount": 5,
              "incomingResolvedCount": 2,
              "incomingExceptionCount": 1,
              "incomingUnresolvedBlockedCount": 1,
              "outgoingCount": 4,
              "outgoingResolvedCount": 1,
              "outgoingExceptionCount": 1,
              "outgoingUnresolvedBlockedCount": 1,
              "totalCount": 9,
              "totalResolvedCount": 3,
              "totalExceptionCount": 2,
              "totalUnresolvedBlockedCount": 2
            }
        }
		{
			// more cards here
		}
	]
}
```
### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer id|internal unique id|
|`title`|string||
|`index`|integer|The position of card (or task) in current lane.|
|`laneId`|integer|The internal unique id of current lane.|
|`boardId`|integer|The internal unique id of board.|
|`color`|hex value||
|`tags`|string array|for example: `[ "bob", "sam" ]`|
|`size`|integer|The user-determined size of card (or task).|
|`priority`|priority value|"low", "normal", "high", or "critical"|
|`plannedStart`|date||
|`plannedFinish`|date||
|`actualStart`|date||
|`actualFinish`|date||
|`archivedOn`|date||
|`isDone`|boolean|Returns `true` when the card has been moved to archive or a `done` lane.|
|`movedOn`|date||
|`updatedOn`|date||
|`externalLinks`|externalLink array| `{ label: "instagram", url: "http://instagram.com" }`|
|`customIcon.id`|integer id||
|`customIcon.cardColor`|hex value||
|`customIcon.iconColor`|hex value||
|`customIcon.iconName`|string||
|`customIcon.iconPath`|stromg||
|`blockedStatus.isBlocked`|boolean||
|`blockedStatus.reason`|string||
|`customHeader.value`|string|Depending on configuration, this may appear in the card or task header.|
|`customHeader.header`|string|The computed value of the card's header. It is the `value` prefixed with `customId.prefix` below.|
|`customHeader.url`|string|When configured, displays the url link for the header.|
|`taskBoardStats.totalCount`|integer||
|`taskBoardStats.completedCount`|integer||
|`taskBoardStats.totalSize`|integer||
|`taskBoardStats.completedSize`|integer||
|`containingCardId`|integer|This is populated when the current object is a task.|
|`cardType.id`|integer||
|`cardType.name`|string||
|`subscriptionId`|integer|This is for internal subscription tracking only; do not use.|
|`scoring`|object|Card scoring data, Example: `{ confidenceTotal: 34, scoreOverride: 99, scoreTotal: 72, isTemplateChanged: false, scores: [ { metricId: 1, score: 27.1, confidence: 45.7 } ] }`|
|`parentCards`|array of parentCard|Example: `{ id: 123, title: "A parent card" }`|
|`assignedUsers`|array of users|Example: `{ id: 123, fullName: "John Smith", avatar: (link to avatar), emailAddress: "john@myco.com" }`|
|`connectedCardStats.startedCount`|integer||
|`connectedCardStats.startedSize`|integer||
|`connectedCardStats.notStartedCount`|integer||
|`connectedCardStats.notStartedSize`|integer||
|`connectedCardStats.completedCount`|integer||
|`connectedCardStats.completedSize`|integer||
|`connectedCardStats.blockedCount`|integer||
|`connectedCardStats.totalCount`|integer||
|`connectedCardStats.totalSize`|integer||
|`connectedCardStats.plannedStart`|date||
|`connectedCardStats.plannedFinish`|date||
|`connectedCardStats.actualStart`|date||
|`connectedCardStats.actualFinish`|date||
|`connectedCardStats.pastDueCount`|integer||
|`connectedCardStats.projectedLateCount`|integer||
|`customFields`|object| The object keys are the custom field id, and the values are the custom field value.  Example: `{ 943852689: "Custom Field Value" }`|
|`planningIncrementIds`|array of planning increment ids||
|`dependencyStats.incomingCount`|integer|Incoming dependencies are cards that this card depends on|
|`dependencyStats.incomingResolvedCount`|integer|Incoming dependencies that are already resolved|
|`dependencyStats.incomingExceptionCount`|integer|Unresolved incoming dependencies that have exceptions (blocked, date mismatches, late to start or finish) |
|`dependencyStats.incomingUnresolvedBlockedCount`|integer|Unresolved incoming dependencies that are blocked |
|`dependencyStats.outgoingCount`|integer|Outgoing dependencies are cards that depend on this card|
|`dependencyStats.outgoingResolvedCount`|integer|Outgoing dependencies that are already resolved by this card|
|`dependencyStats.outgoingExceptionCount`|integer|Unresolved outgoing dependencies that have exceptions (blocked, date mismatches, late to start or finish)|
|`dependencyStats.outgoingUnresolvedBlockedCount`|integer|Unresolved outgoing dependencies that are blocked|
|`dependencyStats.totalCount`|integer|Total of incoming and outgoing dependencies|
|`dependencyStats.totalResolvedCount`|integer|Total resolved|
|`dependencyStats.totalExceptionCount`|integer|Total exceptions|
|`dependencyStats.totalUnresolvedBlockedCount`|integer|Total unresolved blocked dependencies|
---
title: Apply the user's staged card scores to specified cards
preview: true
public: false
repo: core-board-service
---
# POST /io/board/:boardId/scoring/apply
Apply the user's staged card scores to specified cards

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `cardIds` |array of card ids| The ids of the cards to have their staged scores applied to the card ||

### Example Requests
```json
{
    "cardIds": [
        "104896580",
        "104896584",
        "104904160"
    ]
}
```

### Example Successful Response

204 No Content



---
title: Delete applied card scores
preview: true
public: false
repo: core-card-service
---
# DELETE /io/card/scoring
Delete applied card scores

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `boardId` |integer| The id of the board with the cards to have their scores removed ||
| `cardIds` |array of card ids| The ids of the cards to have their scores removed ||

### Example Requests
```json
{
    "boardId": "1201",
    "cardIds": [
        "10001",
        "10002"
    ]
}
```

### Example Successful Response

204 No Content


---
title: Delete a card scoring template
public: false
repo: core-board-service
---

# DELETE /io/board/:boardId/scoring/template/:templateId
Deletes the board-level template

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/:boardId/scoring/template/:templateId \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Response
```
204 No Content
```---
title: Get a card scoring template for a board
public: false
repo: core-board-service
---

# GET /io/board/:boardId/scoring/template/:templateId
Get a specific template. The requested template must be accessible to the board

### Example Request
``` shell
curl -X GET \
  https://myaccount.leankit.com/io/board/:boardId/scoring/template/:templateId \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Response
``` json
    {
        "id": "5051414",
        "version": 1,
        "title": "Custom Template",
        "description": "This template is accessible through the board",
        "isSystemTemplate": false,
        "isOrgTemplate": false,
        "isBoardTemplate": true,
        "metrics": [
            {
                "id": "5051415",
                "label": "Metric 1",
                "prompt": "What is the first metric?",
                "abbreviation": "FM",
                "weight": 0.8,
                "isInverted": false
            },
            {
                "id": "5051416",
                "label": "Metric 2",
                "prompt": "What is the second metric?",
                "abbreviation": "SM",
                "weight": 0.2,
                "isInverted": false
            }
        ]
    }
```---
title: Get user's card scoring for a board
preview: false
public: true
repo: core-board-service
---
# GET /io/board/:boardId/scoring
Get the current state of the user's card scoring for a board.


### Example Request
```shell
curl -X GET \
  https://acmeco.leankit.com/io/board/10100193219/scoring' \
  -H 'Authorization: Basic ZGFuaEBwbGFudmlldy4jb206dGVzdDEyMzQ=' \
  -H 'Content-Type: application/json' \
```

### Example Successful Response

200 Success
```json
{
    "template": {
        "id": "1001",
        "version": "1",
        "isTemplateChanged": false,
        "title": "Weighted Shortest Job First (WSJF)",
        "description": "Weighted Shortest Job First (WSJF)",
        "metrics": [
            {
                "id": "1",
                "label": "Value",
                "prompt": "How valuable is this work?",
                "abbreviation": "V",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "2",
                "label": "Time Criticality",
                "prompt": "How critical is it to do this work now?",
                "abbreviation": "TC",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "3",
                "label": "Risk Reduction",
                "prompt": "How much does this work reduce future risk?",
                "abbreviation": "RR",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "4",
                "label": "Effort",
                "prompt": "How much effort is involved in this work?",
                "abbreviation": "E",
                "weight": 0.4,
                "isInverted": true
            }
        ]
    },
    "cards": [
        {
            "cardId": "10105790505",
            "scoreTotal": 43.1,
            "scoreOverride": 76,
            "confidenceTotal": 33.5,
            "scores": [
                {
                    "metricId": "1",
                    "score": 27.1,
                    "confidence": 45.7
                }
                // more scores here
            ]
        },
			  // more cards here
	]
}
```
### Response Properties
|Property|Type|Note|
|--------|----|----|
|`template`|object|The definition of the current template used for the card scoring|
|`cards`|array of card|The cards that have been scored with score and confidence totals and component scores|


---
title: List card scoring templates for a board
public: false
repo: core-board-service
---
# GET /io/board/:boardId/scoring/template
List all the card scoring template available for use on a board

### Example Request
``` shell
curl -X GET \
  https://myaccount.leankit.com/io/board/:boardId/scoring/template \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Response
``` json
[
    {
        "id": "1001",
        "version": 1,
        "title": "Weighted Shortest Job First (WSJF)",
        "description": "Weighted Shortest Job First (WSJF)",
        "isSystemTemplate": true,
        "isOrgTemplate": false,
        "isBoardTemplate": false,
        "metrics": [
            {
                "id": "1",
                "label": "Value",
                "abbreviation": "V",
                "prompt": "How valuable is this work?",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "2",
                "label": "Time Criticality",
                "abbreviation": "TC",
                "prompt": "How critical is it to do this work now?",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "3",
                "label": "Risk Reduction",
                "abbreviation": "RR",
                "prompt": "How much does this work reduce future risk?",
                "weight": 0.2,
                "isInverted": false
            },
            {
                "id": "4",
                "label": "Effort",
                "abbreviation": "E",
                "prompt": "How much effort is involved in this work?",
                "weight": 0.4,
                "isInverted": true
            }
        ]
    },
    {
        "id": "1002",
        "version": 1,
        "title": "Value vs Cost",
        "description": "Value vs Cost",
        "isSystemTemplate": true,
        "isOrgTemplate": false,
        "isBoardTemplate": false,
        "metrics": [
            {
                "id": "5",
                "label": "Value",
                "abbreviation": "V",
                "prompt": "How valuable is this work?",
                "weight": 0.5,
                "isInverted": false
            },
            {
                "id": "6",
                "label": "Cost",
                "abbreviation": "C",
                "prompt": "How much will it cost to do this work?",
                "weight": 0.5,
                "isInverted": true
            }
        ]
    },
    {
        "id": "1003",
        "version": 1,
        "title": "Three Buckets",
        "description": "Three Buckets",
        "isSystemTemplate": true,
        "isOrgTemplate": false,
        "isBoardTemplate": false,
        "metrics": [
            {
                "id": "7",
                "label": "Strategy Alignment",
                "abbreviation": "SA",
                "prompt": "How aligned is this work toward our strategy?",
                "weight": 0.5,
                "isInverted": false
            },
            {
                "id": "8",
                "label": "Change Required",
                "abbreviation": "CR",
                "prompt": "How much change is required for this work?",
                "weight": 0.3,
                "isInverted": true
            },
            {
                "id": "9",
                "label": "End User Importance",
                "abbreviation": "EUI",
                "prompt": "How important is this work to the end user?",
                "weight": 0.2,
                "isInverted": false
            }
        ]
    },
    {
        "id": "5051010",
        "version": 1,
        "title": "Custom Board template Name",
        "description": "this is optional",
        "isSystemTemplate": false,
        "isOrgTemplate": false,
        "isBoardTemplate": true,
        "metrics": [
            {
                "label": "A Custom Metric",
                "prompt": "What does the metric show?",
                "abbreviation": "ACM",
                "weight": 1,
                "isInverted": false,
                "id": "5051011"
            }
        ]
    }
]
```---
title: Set the current scoring template and/or cards to score for a board
preview: true
public: false
repo: core-board-service
---
# PATCH /io/board/:boardId/scoring
Set the current scoring template and/or cards to score for a board.

The payload of `cardIds` is an exclusive list of cards currently being scored.
- Any cards currently being scored that are not on the list will be removed from card scoring.
- Any cards not currently being scored that are in the list will be added to scoring with default values.
- Any cards currently being scored that are in the list will remain unchanged.
- Sending an empty array will remove all cards from the current scoring session.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `template` |object| The id and version of the template being set for the user's card scoring session ||
| `cardIds` |array of card ids| The ids of the cards to be used for the user's card scoring session ||

### Example Requests
```json
{
    "template": {
        "id": "1",
        "version": "1"
    },
    "cardIds": [
        "10001",
        "10002"
    ]
}
```

### Example Successful Response

204 No Content



---
title: Create a new card scoring template
public: false
repo: core-board-service
---

# POST /io/board/:boardId/scoring/template
Create a new custom board-level card scoring template.

### Request Properties

|Param|Type|Usage|Default|
|-----|----|-----|-------|
|`title`|string|The title of the scoring template||
|`description`|string|A Description of the scoring template||
|`metrics`|object array|An array of objects describing the metrics used for scoring cards. The metric weights must sum to exactly 1||

### Example Request
``` json
{
    "title": "Custom Template Name",
    "description": "this is optional",
    "metrics": [
        {
            "label": "Metric 1",
            "prompt": "What does this measure?",
            "abbreviation": "TS",
            "weight": 1.0,
            "isInverted": false
        }
        // more metrics here
    ]
}
```

### Example Response
``` json
{
    "id": "5051818",
    "version": 1,
    "boardId": "5050202",
    "enabled": true
}
```---
title: Update existing card scoring template
public: false
repo: core-board-service
---

# PUT /io/board/:boardId/scoring/template/:templateId
Update an existing board-level card scoring template.

### Request Properties
|Param|Type|Usage|Default|
|-----|----|-----|-------|
|`title`|string|The title of the scoring template||
|`description`|string|A Description of the scoring template||
|`enabled`|boolean|enabled or disabled this template||
|`metrics`|object array|An array of objects describing the metrics used for scoring cards. You must provide the metric id when updating metrics. The metric weights must sum to exactly 1||

### Example Request
``` json
    {
        "title": "Custom Template Name 123",
        "description": "this is optional",
        "enabled": true,
        "metrics": [
            {
                "id": "5051418", // will update the metric
                "label": "Metric 1",
                "prompt": "This is the first metric",
                "abbreviation": "M1",
                "weight": 0.4,
                "isInverted": false
            },
            {
                "label": "Metric 2", // will create this metric
                "prompt": "This is metric 2",
                "abbreviation": "M2",
                "weight": 0.6,
                "isInverted": false
            }
            // more metric updates or creates here
        ]
    }
```

### Example Response
If there were changes present in the payload
``` json
{
    "id": "5051414",
    "version": 2,
    "boardId": "5050202",
    "enabled": true
}
```

Otherwise,
``` 
204 No Content
```

---
title: Update staged card score for a card
preview: true
public: false
repo: core-board-service
---
# PUT /io/board/:boardId/scoring/card/:cardId
Update the staged card score for a card.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|---|
| `scoreTotal` |float| The combined total score for the card ||
| `scoreOverride` |float| Score override when score is manually applied ||
| `confidenceTotal` |float| The combined confidence total for the card's score ||
| `scores` |array of metric score objects| The individual component scores for each of the template's metric ||

### Example Requests
```json
{
    "scoreTotal": 43.1,
    "scoreOverride": null,
    "confidenceTotal": 33.5,
    "scores": [
        {
            "metricId": 1,
            "score": 27.3,
            "confidence": 95.9
        }
        // more scores for metrics go here
    ]
}
```

### Example Successful Response

204 No Content

---
title: Create a card type
public: true
repo: core-board-service
---
# POST /io/board/:boardId/cardType
Create a card type on a board.

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`name`*|string|Name of the card type||
|`colorHex`*|string|Background color for cards of this card type||
|`isCardType`|boolean|Determines if card type will be used for standard cards on a board|`false`|
|`isTaskType`|boolean|Determines if card type will be used for task cards|`false`|

### Minimal Request
Minimum fields required
```json
{
    "name": "New Card Type",
    "colorHex": "#f0f0f0"
}
```

### Full Request
```json
{
    "name": "New Card Type",
    "colorHex": "#f0f0f0",
    "isCardType": true,
    "isTaskType": false
}
```

### Example Successful Response
201 Created

```json
{
    "id": "947429871",
    "name": "New Card Type",
    "colorHex": "#f0f0f0",
    "isCardType": true,
    "isTaskType": false,
    "isDefaultTaskType": false
}
```

---
title: Delete a card type
public: true
repo: core-board-service
---
# DELETE /io/board/:boardId/cardType/:cardTypeId
Delete a card type on a board.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/10113014456/cardType/10113014462 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response
204 No Content
---
title: Get a single card type on a board
public: true
repo: core-board-service
---
# GET /io/board/:boardId/cardType/:cardTypeId
Get a single card type on a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/cardType/10113014462 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
  "id": "10113014462",
  "name": "Feature",
  "colorHex": "#BFDFC2",
  "isDefault": true,
  "isCardType": true,
  "isTaskType": true,
  "isDefaultTaskType": false
}
```
---
title: Get a list of card types for a board
public: true
repo: core-board-service
---
# GET /io/board/:boardId/cardType
Get a list of card types for a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/cardType \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "cardTypes": [
        {
            "id": "10113014460",
            "name": "Defect",
            "colorHex": "#F1C7C5",
            "isDefault": false,
            "isCardType": true,
            "isTaskType": true,
            "isDefaultTaskType": false
        },
        {
            "id": "10113014462",
            "name": "Feature",
            "colorHex": "#BFDFC2",
            "isDefault": true,
            "isCardType": true,
            "isTaskType": true,
            "isDefaultTaskType": false
        }
    ]
}
```
---
title: Update a card type
public: true
repo: core-board-service
---
# PATCH /io/board/:boardId/cardType/:cardTypeId
Update a card type on a board.

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`name`|string|Name of the card type||
|`colorHex`|string|Background color for cards of this card type||
|`isCardType`|string|Determines if card type will be used for standard cards on a board|`false`|
|`isTaskType`|boolean|Determines if card type will be used for task cards|`false`|


### Example Request
```json
{
    "colorHex": "#ffffff"
}
```

### Example Successful Response
200 OK

```json
{
    "id": "947429871",
    "name": "New Card Type",
    "colorHex": "#ffffff",
    "isCardType": true,
    "isTaskType": false,
    "isDefaultTaskType": false
}
```

---
title: Create a comment
public: true
repo: core-card-service
---
# POST /io/card/:cardId/comment
Create a comment.

### Example Request
```json
{
    "text": "Sample comment body"
}
```

### Example Successful Response
201 Created

```json
{
    "id": "947429871",
    "createdOn": "2019-12-11T20:23:17Z",
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "text": "Sample comment body"
}
```

---
title: Delete a comment
public: true
repo: core-card-service
---
# DELETE /io/card/:cardId/comment/:commentId
Delete a comment.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/card/943206946/comment/943867019 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get a list of comments for a card
public: true
repo: core-card-service
---
# GET /io/card/:cardId/comment
Get a list of comments for a card.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first comment to be returned.|0|
|`limit`|integer|Set the number of comments to be returned.|400|
|`sortBy`|enumeration|Set the ordering of the results. One of:<br />`newest`<br />`oldest`|`oldest`|
|`includeChildComments`|boolean|Set to 'true' to include child card comments, will interleave card/child comments in response payload|false|


### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/comment \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 1,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 1
    },
    "comments": [
        {
            "id": "943867019",
            "createdOn": "2019-12-04T20:37:23Z",
            "createdBy": {
                "id": "478440842",
                "emailAddress": "user@leankit.com",
                "fullName": "First Last",
                "avatar": "/avatar/Show/478440842?s=25"
            },
            "text": "<p>This is a sample comment</p>",
            "cardId": "123456789"
        }
    ],
    "cards": [
      {
        "id": "123456789",
        "boardId": "000000001"
        // . . . Card Face properties
      }
    ],
    "boards": [
      {
        "id": "000000001",
        "title": "Board Title",
        "level": {
            "id": "961018244",
            "depth": 1,
            "maxDepth": 4,
            "label": "Portfolio ",
            "color": "#2966a3",
          },
      }
    ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`pageMeta`|object||
|`comments`|array of comments| All card comments.  When specifying `includeChildComments` child comments will also be returned|
|`cards`|array of Card Faces|Contains Card Faces for all comments represented in the comments array ( see [/io/cardface](/markdown/card-face/list.md) for schema). Returned only when `includeChildComments` is true|
|`boards`|array of boards|Contains boards for all cards represented in the array of cardfaces. Returned only when `includeChildComments` is true|

### Comment Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer|internal unique id of comment|
|`createdOn`|date|comment creation date|
|`createdBy`|object|example: `{ id: 123, fullName: "John Smith", avatar: (link to avatar), emailAddress: "john@myco.com" }`|
|`text`|string|comment text|
|`cardId`|integer|the internal unique id of the comment's card|

### Board Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer|internal unique id of board|
|`title`|string|board title|
|`level`|object|Requires the board levels feature.  example: `{ "id": "1", "depth": 1, "maxDepth": 4, "label": "Portfolio ", "color": "#2966a3", }` ( see [/io/boardLevel](/markdown/board-level/list.md) for schema )|
---
title: Update a comment
public: true
repo: core-card-service
---
# PUT /io/card/:cardId/comment/:commentId
Update a comment.

### Example Request
```json
{
    "text": "Sample comment body with updates"
}
```

### Example Successful Response
200 OK

```json
{
    "id": "947429871",
    "createdOn": "2019-12-11T20:23:17Z",
    "createdBy": {
        "id": "478440842",
        "emailAddress": "user@leankit.com",
        "fullName": "First Last",
        "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
    },
    "text": "Sample comment body with updates"
}
```

---
title: Get a list of child board connections
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/connection
Get a list of child board connections. This is the unique set of child boards related to the parent card.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/connection \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "connections": [
        {
            "cardId": "943206946",
            "boardId": "943929912",
            "boardTitle": "Child board",
            "isFollowable": true,
            "isRemovable": true,
            "isArchived": false
        },
        {
            "cardId": "943206946",
            "boardId": "943188457",
            "boardTitle": "Example board",
            "isFollowable": true,
            "isRemovable": true,
            "isArchived": false
        }
    ]
}
```
---
title: Get a list of child cards' ids only
public: false
repo: core-card-service
---
# GET /io/card/:cardId/connection/children/ids
Get a list of child card ids for a parent card.

Note: This is an internal endpoint. It was created as a performance enhancement for Tasktop integrations.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|

### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/card/999999999/connection/children/ids' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 3,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 3
    },
    "ids": [
        "888888888",
        "777777666",
        "666666666"
    ]
}```

---
title: Get a list of child cards
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/connection/children
Get a list of child cards for a parent card.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|25|
|`boardId`|string|Limit the results to the specified board||
|`cardStatus`|enumeration|Comma separated list with one or more values. Options are: <br /> `notStarted` <br /> `started` <br /> `finished`|notStarted, started, finished|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/connection/children?cardStatus=notStarted,started,finished \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 2
    },
    "cards": [
        {
            "assignedUsers": [
                {
                    "id": "478440842",
                    "fullName": "User Name",
                    "emailAddress": "user@leankit.com",
                    "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
                }
            ],
            "actualFinish": "2019-12-04T20:26:34Z",
            "actualStart": "2019-12-04T20:26:34Z",
            "blockedStatus": {
                "isBlocked": true,
                "reason": "The block reason",
                "date": "2019-12-04T20:27:45Z"
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "41",
                "isArchived": false
            },
            "customIcon": {
                "id": "943188467",
                "title": "Expedite",
                "cardColor": "#FFFFFF",
                "iconColor": "e35027",
                "iconName": "lk_icons_final_01-03",
                "iconPath": "https://myaccount.leankit.com/customicons/24/e35027/lk_icons_final_01-03.png"
            },
            "customIconLabel": "Class of Service",
            "color": "#B8CFDF",
            "iconPath": null,
            "createdOn": "2019-12-03T23:15:44Z",
            "archivedOn": null,
            "description": "<p>The description of the card</p>",
            "plannedFinish": "2019-12-11",
            "customHeader": {
                "value": "The card header",
                "header": "The card header",
                "url": null
            },
            "customId": {
                "value": "The card header",
                "prefix": null,
                "url": null
            },
            "externalLinks": [
                {
                    "label": "Link Title",
                    "url": "https://www.leankit.com"
                }
            ],
            "id": "943206826",
            "index": 0,
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188473",
                "index": 3,
                "laneClassType": "active",
                "laneType": "completed",
                "orientation": "vertical",
                "title": "Recently Finished"
            },
            "isDone": true,
            "updatedOn": "2019-12-04T20:26:34Z",
            "movedOn": "2019-12-04T20:26:34Z",
            "priority": "normal",
            "size": 2,
            "plannedStart": "2019-12-05",
            "tags": [
                "tagone",
                "tagtwo"
            ],
            "title": "Card One",
            "version": "10",
            "type": {
                "id": "943188463",
                "title": "New Feature",
                "cardColor": "#B8CFDF"
            },
            "taskBoardStats": null,
            "connectedCardStats": null
        },
        {
            "assignedUsers": [],
            "actualFinish": null,
            "actualStart": null,
            "blockedStatus": {
                "isBlocked": false,
                "reason": null,
                "date": null
            },
            "board": {
                "id": "943188457",
                "title": "Example board",
                "version": "41",
                "isArchived": false
            },
            "customIcon": null,
            "customIconLabel": "Class of Service",
            "color": "#B8CFDF",
            "iconPath": null,
            "createdOn": "2019-12-03T23:15:55Z",
            "archivedOn": null,
            "description": null,
            "plannedFinish": null,
            "customHeader": {
                "value": null,
                "header": null,
                "url": null
            },
            "customId": {
                "value": null,
                "prefix": null,
                "url": null
            },
            "externalLinks": [],
            "id": "943204705",
            "index": 0,
            "lane": {
                "cardLimit": 0,
                "description": null,
                "id": "943188475",
                "index": 0,
                "laneClassType": "backlog",
                "laneType": "ready",
                "orientation": "vertical",
                "title": "New Requests"
            },
            "isDone": false,
            "updatedOn": "2019-12-03T23:41:31Z",
            "movedOn": "2019-12-03T23:15:55Z",
            "priority": "normal",
            "size": 0,
            "plannedStart": null,
            "tags": [],
            "title": "Card Two",
            "version": "9",
            "type": {
                "id": "943188463",
                "title": "New Feature",
                "cardColor": "#B8CFDF"
            },
            "taskBoardStats": {
                "totalCount": 2,
                "completedCount": 1,
                "totalSize": 2,
                "completedSize": 1
            },
            "connectedCardStats": null
        }
    ],
    "redactedCount": 0
}
---
title: Create a drill through board connection to another board
deprecated: true
public: false
repo: core-leankit-api
---
# PUT /io/card/:cardId/connection/:boardId
Create a drill through board connection to another board.

```shell
curl -X PUT \
  https://myaccount.leankit.com/io/card/943206946/connection/944515478 \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "cardId": "943206946",
    "boardId": "944515478",
    "boardTitle": "Child board",
    "isFollowable": true,
    "isArchived": false,
    "isRemovable": true,
    "parentBoardVersion": "95",
    "boardVersion": "2"
}
```

---
title: Connect a parent card to one or more child cards
deprecated: true
public: true
repo: core-leankit-api
---
# POST /io/card/:cardId/connection/many
Connect a parent card to one or more child cards.

_Note: This has been deprecated in favor of our [connections create](/markdown/connections/create.md) endpoint._

### Example Request
Connect these two child cards to the parent specified in the url
```json
{
	"connectedCardIds": [ "944509659", "944511282" ]
}
```

### Example Successful Response
200 OK
```json
{
    "card": {
        "id": "943206946",
        "title": "Card Three",
        "boardId": "943188457",
        "boardTitle": "Example board",
        "boardVersion": "92"
    },
    "connections": [
        {
            "connectedCard": {
                "id": "944509659",
                "title": "Example Child Card",
                "boardId": "943188457",
                "boardTitle": "Example board",
                "boardVersion": "92"
            },
            "connectionType": "child"
        },
        {
            "connectedCard": {
                "id": "944511282",
                "title": "Example Child Card Two",
                "boardId": "943188457",
                "boardTitle": "Example board",
                "boardVersion": "92"
            },
            "connectionType": "child"
        }
    ]
}
```

---
title: Create a drill through board connection to the card's current board
deprecated: true
public: false
repo: core-leankit-api
---
# PUT /io/card/:cardId/connection/same
Create a drill through board connection to the card's current board

```shell
curl -X PUT \
  https://myaccount.leankit.com/io/card/943206946/connection/same \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "cardId": "944607454",
    "boardId": "944576308",
    "boardTitle": "Current Board",
    "isFollowable": true,
    "isArchived": false,
    "isRemovable": true,
    "parentBoardVersion": "3"
}
```

---
title: Create parent and child connections
public: true
repo: core-card-service
---
# POST /io/card/connections
Connect cards to child or parent cards.

### Example Request
Connect a card to a child card
```json
{
   "cardIds":[
      "943204705"
   ],
   "connections":{
      "children":[
         "943206826"
      ]
   }
}
```

Connect multiple cards to multiple parents
```json
{
   "cardIds":[
      "943206826",
      "943204705"
   ],
   "connections":{
      "parents":[
         "943206946",
         "943207144"
      ]
   }
}
```


### Example Successful Response
201 Created

---
title: Delete all connections by board id
public: true
repo: core-leankit-api
---
# DELETE /io/card/:cardId/connection/:boardId
Delete every connection to child cards on the specified board.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/card/943206946/connection/943929912 \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "parentBoardVersion": "86",
    "boardVersion": "14"
}
```

---
title: Delete Connections
public: true
repo: core-leankit-api
---
# DELETE /io/card/connections
Delete one or more parent or child connections.

### Example Request
Delete a child card connection
```json
{
   "cardIds":[
      "943204705"
   ],
   "connections":{
      "children":[
         "943206826"
      ]
   }
}
```

Delete multiple parent connections from multiple cards
```json
{
   "cardIds":[
      "943206826",
      "943204705"
   ],
   "connections":{
      "parents":[
         "943206946",
         "943207144"
      ]
   }
}
```


### Example Successful Response
204 No Content

---
title: Get a list of parent board connections
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/connection/parent-boards
Get a list of parent board connections. This is the unique set of parent boards related to the parent card.

|Param|Usage|Default|
|-----|-----|-------|
|offset|Set the "start row" number of the first card to be returned.|0|
|limit|Set the number of boards to be returned.|25|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/connection/parent-boards \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 2
    },
    "boards": [
        {
            "boardId": "943188457",
            "boardTitle": "Example board",
            "canView": true,
            "isArchived": false
        },
        {
            "boardId": "943926001",
            "boardTitle": "Parent board",
            "canView": true,
            "isArchived": false
        }
    ]
}
```
---
title: Get a list of parent cards
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/connection/parents
Get a list of parent cards for a child card.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|
|`board`|string|Limit the results to the specified board||

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206826/connection/parents \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 2
    },
    "cards": [
        {
            "id": "943206946",
            "title": "Card Three",
            "index": 0,
            "laneId": "943188474",
            "color": "#B8CFDF",
            "tags": [
                "tagone",
                "tagtwo"
            ],
            "size": 2,
            "priority": "high",
            "plannedStart": "2019-12-20",
            "plannedFinish": "2019-12-23",
            "actualStart": null,
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2019-12-03T23:27:44.576Z",
            "updatedOn": "2019-12-04T20:38:33.000Z",
            "externalLinks": [
                {
                    "label": "Link Title",
                    "url": "https://www.leankit.com"
                }
            ],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": true,
                "reason": "Blocked card reason"
            },
            "customIcon": {
                "id": "943188468",
                "cardColor": "#FFFFFF",
                "iconColor": "49bbd6",
                "iconName": "lk_icons_final_05-11",
                "iconPath": "../../customicons/24/49bbd6/lk_icons_final_05-11.png"
            },
            "customHeader": {
                "value": "The card header text",
                "header": "The card header text",
                "url": null
            },
            "customId": {
                "value": "The card header text",
                "prefix": null,
                "url": null
            },
            "taskBoardStats": {
                "totalCount": 2,
                "completedCount": 1,
                "totalSize": 2,
                "completedSize": 1
            },
            "containingCardId": null,
            "cardType": {
                "id": "943188463",
                "name": "New Feature"
            },
            "subscriptionId": "943850307",
            "parentCards": [],
            "assignedUsers": [
                {
                    "id": "478440842",
                    "fullName": "User Name",
                    "emailAddress": "user@leankit.com",
                    "avatar": "https://myaccount.leankit.com/avatar/Show/478440842?s=25"
                }
            ],
            "connectedCardStats": {
                "startedCount": 0,
                "startedSize": 0,
                "notStartedCount": 1,
                "notStartedSize": 1,
                "completedCount": 1,
                "completedSize": 2,
                "blockedCount": 1,
                "totalCount": 2,
                "totalSize": 3,
                "plannedStart": "2019-12-05",
                "plannedFinish": "2019-12-11",
                "actualStart": "2019-12-04T20:26:34Z",
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0
            },
            "canView": true
        },
        {
            "id": "943207144",
            "title": "Card Four",
            "index": 1,
            "laneId": "943188474",
            "color": "#B8CFDF",
            "tags": [],
            "size": 0,
            "priority": "normal",
            "plannedStart": null,
            "plannedFinish": null,
            "actualStart": null,
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2019-12-03T23:27:51.543Z",
            "updatedOn": "2019-12-03T23:41:31.453Z",
            "externalLinks": [],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null
            },
            "customIcon": null,
            "customHeader": {
                "value": null,
                "header": null,
                "url": null
            },
            "customId": {
                "value": null,
                "prefix": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "943188463",
                "name": "New Feature"
            },
            "subscriptionId": null,
            "parentCards": [],
            "assignedUsers": [],
            "connectedCardStats": {
                "startedCount": 0,
                "startedSize": 0,
                "notStartedCount": 1,
                "notStartedSize": 1,
                "completedCount": 1,
                "completedSize": 2,
                "blockedCount": 1,
                "totalCount": 2,
                "totalSize": 3,
                "plannedStart": "2019-12-05",
                "plannedFinish": "2019-12-11",
                "actualStart": "2019-12-04T20:26:34Z",
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0
            },
            "canView": true
        }
    ]
}
---
title: Get drill through statistics for child boards
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/statistics
Get drill through statistics for child boards.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/statistics \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

### Example Successful Response
200 OK
```json
{
    "card": {
        "id": "943206946",
        "isBlocked": true,
        "size": 2,
        "plannedStart": "2019-12-20T00:00:00.000Z",
        "plannedFinish": "2019-12-23T00:00:00.000Z",
        "actualStart": null,
        "actualFinish": null
    },
    "drillThroughStats": {
        "startedCount": 0,
        "startedSize": 0,
        "notStartedCount": 2,
        "notStartedSize": 2,
        "completedCount": 1,
        "completedSize": 2,
        "blockedCount": 1,
        "plannedStart": "2019-12-05T00:00:00.000Z",
        "plannedFinish": "2019-12-11T00:00:00.000Z",
        "actualStart": "2019-12-04T20:26:34.380Z",
        "actualFinish": "2019-12-04T20:26:34.380Z",
        "pastDueCount": 0,
        "projectedLateCount": 0,
        "size": 4,
        "count": 3,
        "hasCardProjectedLate": false,
        "progress": 50
    },
    "boards": [
        {
            "boardId": "943188457",
            "cardStats": {
                "startedCount": 0,
                "startedSize": 0,
                "notStartedCount": 1,
                "notStartedSize": 1,
                "completedCount": 1,
                "completedSize": 2,
                "blockedCount": 1,
                "plannedStart": "2019-12-05T00:00:00.000Z",
                "plannedFinish": "2019-12-11T00:00:00.000Z",
                "actualStart": "2019-12-04T20:26:34.380Z",
                "actualFinish": "2019-12-04T20:26:34.380Z",
                "pastDueCount": 0,
                "projectedLateCount": 0,
                "size": 3,
                "count": 2,
                "hasCardProjectedLate": false,
                "progress": 66.66666666666666
            }
        },
        {
            "boardId": "943929912",
            "cardStats": {
                "startedCount": 0,
                "startedSize": 0,
                "notStartedCount": 1,
                "notStartedSize": 1,
                "completedCount": 0,
                "completedSize": 0,
                "blockedCount": 0,
                "plannedStart": null,
                "plannedFinish": null,
                "actualStart": null,
                "actualFinish": null,
                "pastDueCount": 0,
                "projectedLateCount": 0,
                "size": 1,
                "count": 1,
                "hasCardProjectedLate": false,
                "progress": 0
            }
        }
    ]
}
```
---
title: Get a list of custom fields on a board
public: true
repo: core-leankit-api
---
# GET /io/board/:boardId/customfield
Get a list of custom fields on a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/customfield \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "limit": 8,
    "customFields": [
        {
            "id": "10113041726",
            "index": 0,
            "type": "text",
            "label": "Field Name",
            "helpText": "Here is some helpful text",
            "createdOn": "2020-01-10T20:50:43Z",
            "createdBy": "25035"
        }
    ]
}
```

_Note: `limit` is the maximum number of custom fields that can be created for the board_
---
title: Update a custom field
public: true
repo: core-leankit-api
---
# PATCH /io/board/:boardId/customfield
Add, update, or remove custom fields on a board by providing an array of operations to perform.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|------|-------|
|`op`*|enumeration|`add`, `replace`, or `remove`||
|`path`*|string|A path targeting an existing record by id (\"/1234\") or  \"/\" for an add operation ||
|`value.label`|string|||
|`value.helpText`|string|||
|`value.type`|enumeration|`text`, `number`, `date`, `choice`, `multi`||
|`value.index`|integer|Ordering of field for display purposes||
|`value.choiceConfiguration.choices`|array|List of strings to show in dropdown||

### Example Update Request

```json
[
  {
    "op": "replace",
    "path": "/101010",
    "value": {
      "label": "New field name",
      "helpText": "Helpful text",
      "choiceConfiguration": {
        "choices": ["Option1", "Option2"]
      }
    }
  },
  {
    "op": "replace",
    "path": "/101011",
    "value": {
      "label": "Another field",
      "helpText": "More helpful text"
    }
  }
]
```

### Example Create Request

```json
[
  {
    "op": "add",
    "path": "/",
    "value": {
      "label": "New Number Field",
      "helpText": "Helpful text",
      "type": "number"
    }
  },
  {
    "op": "add",
    "path": "/",
    "value": {
      "label": "New Text Field",
      "helpText": "Helpful text",
      "type": "text"
    }
  }
]
```

### Example Remove Request

```json
[
  {
    "op": "remove",
    "path": "/101010"
  },
  {
    "op": "remove",
    "path": "/101011"
  }
]

```

### Example Successful Response
200 OK

```json
{
  "customFields": [
    {
      "id":"10113041726",
      "index":0,
      "type":"text",
      "label":"A thing",
      "helpText":"Maybe?",
      "createdOn":"2020-01-10T20:50:43Z",
      "createdBy":"25035"
    },
    {
      "id":"10113041729",
      "index":1,
      "type":"choice",
      "label":"A list!",
      "helpText":"",
      "choiceConfiguration": {
        "choices": ["1","2","3"]
      },
      "createdOn":"2020-01-10T21:01:36Z",
      "createdBy":"25035"
    }
  ]
}
```
---
title: Create a custom icon
public: true
repo: core-board-service
---
# POST /io/board/:boardId/customIcon
Create a custom icon on a board.

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`name`|string|Name of the custom icon||
|`iconColor`|string|Color of the icon| `#212121`|
|`policy`|string|Text that describes the policy for using this icon||
|`iconName`|string|The name of the chosen icon| `blank_icon`|

### Minimal Request
Minimum fields required
```json
{
    "name": "New custom icon"
}
```

### Full Request
```json
{
    "name": "New custom icon",
    "iconColor": "#f0f0f0",
    "policy": "Some notes about when to use this icon",
    "iconName": "selected_icon.png"
}
```

### Example Successful Response
201 Created

```json
{
    "id": "947429871",
    "name": "New custom icon",
    "iconColor": "#f0f0f0",
    "policy": "Some notes about when to use this icon",
    "iconName": "selected_icon.png"
}
```

---
title: Delete a custom icon
public: true
repo: core-board-service
---
# DELETE /io/board/:boardId/customIcon/:customIconId
Delete a custom icon on a board.

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/board/10113014456/customIcon/10113014462 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response
204 No Content
---
title: Get a single custom icon on a board
public: true
repo: core-board-service
---
# GET /io/board/:boardId/customIcon/:customIconId
Get a single custom icon on a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/customIcon/10113014778 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "id": "10113014777",
    "name": "API Testing",
    "policy": null,
    "iconPath": "/customicons/24/212121/someIcon.png",
    "iconColor": "212121",
    "iconName": "someIcon"
}
```
---
title: Get a list of custom icons for a board
public: true
repo: core-board-service
---
# GET /io/board/:boardId/customIcon
Get a list of custom icons for a board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/customIcon \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "customIcons": [
        {
            "id": "10113014777",
            "name": "API Testing",
            "policy": null,
            "iconPath": "/customicons/24/212121/someIcon.png",
            "iconColor": "212121",
            "iconName": "someIcon"
        },
        {
            "id": "10113014778",
            "name": "Standard",
            "policy": "",
            "iconPath": "/Content/Images/Icons/Library/blank.gif",
            "iconColor": null,
            "iconName": null
        }
    ]
}
```
---
title: Update a custom icon
public: true
repo: core-board-service
---
# PATCH /io/board/:boardId/customIcon/:customIconId
Update a custom icon on a board.

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`name`|string|Name of the custom icon||
|`iconColor`|string|Color of the icon| `#212121`|
|`policy`|string|Text that describes the policy for using this icon||
|`iconName`|string|The name of the chosen icon| `blank_icon`|

### Minimal Request
Minimum fields required
```json
{
    "iconColor": "#000000"
}
```

### Full Request
```json
{
    "name": "New custom icon",
    "iconColor": "#000000",
    "policy": "Some notes about when to use this icon",
    "iconName": "selected_icon.png"
}
```

### Example Successful Response
201 Created

```json
{
    "id": "947429871",
    "name": "New custom icon",
    "iconColor": "#000000",
    "policy": "Some notes about when to use this icon",
    "iconName": "selected_icon.png"
}
```
---
title: Create dependencies
public: true
repo: core-card-service
---
# POST /io/card/dependency
Create dependencies

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`cardIds`*|string[]|List of card ids||
|`dependsOnCardIds`*|string[]|List of card ids depended on by `cardIds`||
|`timing`|enumeration|One of:<br />`startToStart`<br />`startToFinish`, <br />`finishToStart`,<br />`finishToFinish`|`finishToStart`|

\* Required

### Example Request
Link one or more cards to one or more dependencies

```json
{
   "cardIds":[
      "1111",
      "2222"
   ],
   "dependsOnCardIds":[
      "3333",
      "4444"
   ],
   "timing": "startToFinish"
}
```

**Timing values**:

- *startToStart* - Dependency can’t start until the card starts
- *startToFinish* - Dependency can’t finish until the card starts
- *finishToStart* - Dependency can’t start until the card finishes
- *finishToFinish* - Dependency can’t finish until the card finishes

### Example Successful Response
201 Created

---
title: Delete dependencies
public: true
repo: core-card-service
---
# DELETE /io/card/dependency
Delete dependencies

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`cardIds`*|string[]|List of card ids||
|`dependsOnCardIds`*|string[]|List of card ids depended on by `cardIds` to unlink||

\* Required

### Example Request
Unlink one or more cards from one or more dependencies

```json
{
   "cardIds":[
      "1111"
   ],
   "dependsOnCardIds":[
      "3333",
      "4444"
   ]
}
```

### Example Successful Response
204 no Content

---
title: Get a list of dependencies for a card
public: true
repo: core-leankit-api
---
# GET /io/card/:cardId/dependency
Get a list of dependencies for a card

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`includeFaces`|boolean|Pass "true" to also include the card face with each result|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/card/943206946/dependency?includeFaces=true \
  -H 'Authorization: Basic base64encodedauthhere' \
  -H 'Content-Type: application/json'
```

Note: dependency `direction` field can either be `incoming` or `outgoing`. An `incoming` dependency is one where the original card (from the url) depends on the card listed in the dependency. An `outgoing` dependency is one where the original card (from the url) is depended on by the card listed in the dependency.

**Timing values**:

- *startToStart* - Dependency can’t start until the card starts
- *startToFinish* - Dependency can’t finish until the card starts
- *finishToStart* - Dependency can’t start until the card finishes
- *finishToFinish* - Dependency can’t finish until the card finishes

### Example Successful Response
200 OK
```json
{
	"dependencies": [
		{
			"direction": "outgoing",
			"cardId": "5252812",
			"timing": "finishToFinish",
			"createdOn": "2025-06-10T19:32:57.237Z",
			"face": {
				"id": "5252812",
				"title": "3",
				"index": 2,
				"laneId": "5147995",
				"boardId": "5147970",
				"cardStatus": "started",
				"color": "#BA7070",
				"tags": [],
				"size": 0,
				"priority": "normal",
				"plannedStart": null,
				"plannedFinish": null,
				"actualStart": "2025-06-10T19:30:59Z",
				"actualFinish": null,
				"isDone": false,
				"movedOn": "2025-06-10T19:30:59.053Z",
				"updatedOn": "2025-06-10T19:40:51.150Z",
				"externalLinks": [],
				"customIconLabel": "Class of Service",
				"isMirroredCard": false,
				"blockedStatus": {
					"isBlocked": false,
					"reason": null
				},
				"customIcon": null,
				"customHeader": {
					"value": null,
					"header": null,
					"url": null
				},
				"taskBoardStats": null,
				"containingCardId": null,
				"cardType": {
					"id": "5147974",
					"name": "Architectural Enabler Story"
				},
				"subscriptionId": null,
				"attachmentsCount": 0,
				"commentsCount": 0,
				"archivedOn": null,
				"parentCards": [],
				"assignedUsers": [],
				"connectedCardStats": null,
				"customFields": {},
				"planningIncrements": [],
				"reactions": [],
				"assignedTeams": [],
				"policyRuleFieldIdViolations": []
			}
		}
	]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`direction`|string|`outgoing` (depends on the `:cardId`) or `incoming` (depended on by the `:cardId`)|
|`cardId`|integer id|internal unique id|
|`timing`|enumeration|Possible values: `startToStart`, `startToFinish`, `finishToStart` or `finishToFinish`|
|`createdOn`|date|The date that the dependency was created|
|`face.id`|integer id|internal unique id|
|`face.title`|string||
|`face.index`|integer|The position of card (or task) in current lane.|
|`face.laneId`|integer|The internal unique id of current lane.|
|`face.boardId`|integer|The internal unique id of board.|
|`face.color`|hex value||
|`face.tags`|string array|for example: `[ "bob", "sam" ]`|
|`face.size`|integer|The user-determined size of card (or task).|
|`face.priority`|priority value|"low", "normal", "high", or "critical"|
|`face.plannedStart`|date||
|`face.plannedFinish`|date||
|`face.actualStart`|date||
|`face.actualFinish`|date||
|`face.archivedOn`|date||
|`face.isDone`|boolean|Returns `true` when the card has been moved to archive or a `done` lane.|
|`face.movedOn`|date||
|`face.updatedOn`|date||
|`face.externalLinks`|externalLink array| `{ label: "instagram", url: "http://instagram.com" }`|
|`face.customIcon.id`|integer id||
|`face.customIcon.cardColor`|hex value||
|`face.customIcon.iconColor`|hex value||
|`face.customIcon.iconName`|string||
|`face.customIcon.iconPath`|stromg||
|`face.blockedStatus.isBlocked`|boolean||
|`face.blockedStatus.reason`|string||
|`face.customHeader.value`|string|Depending on configuration, this may appear in the card or task header.|
|`face.customHeader.header`|string|The computed value of the card's header. It is the `value` prefixed with `customId.prefix` below.|
|`face.customHeader.url`|string|When configured, displays the url link for the header.|
|`face.taskBoardStats.totalCount`|integer||
|`face.taskBoardStats.completedCount`|integer||
|`face.taskBoardStats.totalSize`|integer||
|`face.taskBoardStats.completedSize`|integer||
|`face.containingCardId`|integer|This is populated when the current object is a task.|
|`face.cardType.id`|integer||
|`face.cardType.name`|string||
|`face.subscriptionId`|integer|This is for internal subscription tracking only; do not use.|
|`scoring`|object|Card scoring data, Example: `{ confidenceTotal: 34, scoreOverride: 99, scoreTotal: 72, isTemplateChanged: false, scores: [ { meface.tricId: 1, score: 27.1, confidence: 45.7 } ] }`|
|`face.parentCards`|array of parentCard|Example: `{ id: 123, title: "A parent card" }`|
|`face.assignedUsers`|array of users|Example: `{ id: 123, fullName: "John Smith", avatar: (link to avatar), emailAddress: "john@myco.com" }`|
|`face.connectedCardStats.startedCount`|integer||
|`face.connectedCardStats.startedSize`|integer||
|`face.connectedCardStats.notStartedCount`|integer||
|`face.connectedCardStats.notStartedSize`|integer||
|`face.connectedCardStats.completedCount`|integer||
|`face.connectedCardStats.completedSize`|integer||
|`face.connectedCardStats.blockedCount`|integer||
|`face.connectedCardStats.totalCount`|integer||
|`face.connectedCardStats.totalSize`|integer||
|`face.connectedCardStats.plannedStart`|date||
|`face.connectedCardStats.plannedFinish`|date||
|`face.connectedCardStats.actualStart`|date||
|`face.connectedCardStats.actualFinish`|date||
|`face.connectedCardStats.pastDueCount`|integer||
|`face.connectedCardStats.projectedLateCount`|integer||
|`customFields`|object| The object keys are the custom field id, and the values are the custom field value.  Example: `{ 943852689: "Custom Field Vaface.lue" }`|
|`face.planningIncrementIds`|array of planning increment ids||
|`face.dependencyStats.incomingCount`|integer|Incoming dependencies are cards that this card depends on|
|`face.dependencyStats.incomingResolvedCount`|integer|Incoming dependencies that are already resolved|
|`dependencyStats.incomingExceptionCount`|integer|Unresolved incoming dependencies that have exceptions (blocked, date mismatches, late to start or fiface.nish) |
|`face.dependencyStats.outgoingCount`|integer|Outgoing dependencies are cards that depend on this card|
|`face.dependencyStats.outgoingResolvedCount`|integer|Outgoing dependencies that are already resolved by this card|
|`dependencyStats.outgoingExceptionCount`|integer|Unresolved outgoing dependencies that have exceptions (blocked, date mismatches, late to start or fiface.nish)|
|`face.dependencyStats.totalCount`|integer|Total of incoming and outgoing dependencies|
|`face.dependencyStats.totalResolvedCount`|integer|Total resolved|
|`face.dependencyStats.totalExceptionCount`|integer|Total exceptions|
---
title: Update dependencies
public: true
repo: core-card-service
---
# PATCH /io/card/dependency
Update dependencies

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`cardId`*|string|Card id||
|`dependsOnCardId`*|string|Card id that is depended on by `cardId`||
|`timing`*|enumeration|One of:<br />`startToStart`<br />`startToFinish`, <br />`finishToStart`,<br />`finishToFinish`|`finishToStart`|

\* Required

### Example Request
Update the timing value for one or more dependencies

```json
[
  {
    "cardId": "1111",
    "dependsOnCardId": "3333",
    "timing": "finishToStart"
  },
  {
    "cardId": "2222",
    "dependsOnCardId": "4444",
    "timing": "finishToFinish"
  }
]
```

**Timing values**:

- *startToStart* - Dependency can’t start until the card starts
- *startToFinish* - Dependency can’t finish until the card starts
- *finishToStart* - Dependency can’t start until the card finishes
- *finishToFinish* - Dependency can’t finish until the card finishes

### Example Successful Response
200 OK

---
title: Subscribe to a lane
public: false
repo: core-board-service
---

# PUT /io/board/:boardId/lane/:laneId/subscribe
Subscribe to a lane. This request does not include a body.

### Example Successful Response
201 Created
---
title: Unsubscribe from a lane
public: false
repo: core-board-service
---

# DELETE /io/board/:boardId/lane/:laneId/subscribe
Unsubscribe from a lane.

### Example Successful Response
204 No Content
---
title: Update a lane
public: true
repo: core-board-service
---
# PATCH /io/board/:boardId/lane/:laneId
Update a lane.

_Requires authentication with at least board manager role on the board specified._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`title`|string|Set the lane title on the board||
|`type`||_not supported._ This property is no longer used and may be removed||
|`description`|string|Set the "lane policy" which is viewable when clicking the "i" on a lane. Expects html.||
|`wipLimit`|integer|Set the work in progress (WIP) limit. Appears in the top right of the lane title||
|`isDefaultDropLane`|boolean|Set to 'true' to use this lane as the default drop lane when adding cards. There can be only one default drop lane.||
|`isConnectionDoneLane`|boolean|Deprecated in favor of `cardStatus`: `finished`||
|`cardStatus`|string|`notStarted`, `started`, or `finished`||

For the body, you need only include the properties that you wish to edit. Properties not specified will not be changed.

### Example Requests

Setting a lane as a 'done' lane
```json
{
	"cardStatus": "finished"
}
```
Updating the lane's title and description
```json
{
	"title": "new lane title",
	"description": "the new lane policy"
}

```

### Example Successful Response

200 Success
```json
{
    "id": "10105826895",
    "boardId": "10100193219",
    "title": "Under Review",
    "type": "inProcess",
    "cardStatus": "started",
    "description": "<p>How to use this lane</p>",
    "wipLimit": 5,
    "isDefaultDropLane": false,
    "isConnectionDoneLane": false,
    "sortBy": "priority"
}
```
---
title: Get your organization details
public: false
deprecated: true
repo: core-leankit-api
---
# GET /io/organization/me
Get your organization details.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/organization/me \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "id": "478661825",
    "title": "Org title",
    "description": "The org description",
    "hostName": "myaccount",
    "accountId": "478673724",
    "numberOfDaysToRetrieveAnalyticsEventsFor": 365,
    "analytics": [
        {
            "title": "Speed",
            "slug": "speed",
            "workbook": "SpeedDashboard",
            "view": "Dashboard1",
            "description": "View throughput trends and how quickly work flows through your process over time by day, week or month.",
            "titleLong": "Speed",
            "subTitle": null,
            "sortOrder": 1,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Distribution",
            "slug": "distribution",
            "workbook": "CardDistribution",
            "view": "CardsbyAttribute",
            "description": "Analyze how work is distributed by card type, lane and priority to see if the right work is getting done.",
            "titleLong": "Distribution",
            "subTitle": null,
            "sortOrder": 3,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Efficiency",
            "slug": "efficiency",
            "workbook": "EfficiencyDiagram",
            "view": "QueueSize",
            "description": "See the proportion of Active vs. Inactive work in a lane or set of lanes based on card staleness.",
            "titleLong": "Efficiency",
            "subTitle": null,
            "sortOrder": 4,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Planned Percent Complete",
            "slug": "plannedPercent",
            "workbook": "PPCDashboard",
            "view": "Dashboard1",
            "description": "Understand work completion trends and how well you are meeting schedule commitments by day, week or month.",
            "titleLong": "Planned Percent Complete",
            "subTitle": null,
            "sortOrder": 6,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Burndown",
            "slug": "burndown",
            "workbook": "BurndownDashboard",
            "view": "Dashboard1",
            "description": "Determine how much of a planned set of work is complete as of today and what pace you need to set going forward to meet your schedule.",
            "titleLong": "Burndown",
            "subTitle": null,
            "sortOrder": 8,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Exceptions",
            "slug": "exceptions",
            "workbook": "ExceptionsReportContent",
            "view": "",
            "description": "Determine what work is blocked, stale, or missing planned dates so you know where to focus problem resolution.",
            "titleLong": "Exceptions",
            "subTitle": null,
            "sortOrder": 9,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Flow",
            "slug": "flow",
            "workbook": "FlowDashboard",
            "view": "Dashboard1",
            "description": "View throughput trends and how quickly work flows through your process over time.",
            "titleLong": "Flow",
            "subTitle": null,
            "sortOrder": 11,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Assigned Users",
            "slug": "assignedUsers",
            "workbook": "AssignedUsers",
            "view": "Dashboard1",
            "description": "View how work is currently distributed across team members to help balance workload with capacity.",
            "titleLong": "Assigned Users",
            "subTitle": null,
            "sortOrder": 12,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Timeline",
            "slug": "timeline",
            "workbook": "timeline",
            "view": "",
            "description": "View cards by planned start date, measured by planned duration",
            "titleLong": "Timeline",
            "subTitle": null,
            "sortOrder": 20,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        }
    ],
    "zendeskDropboxId": "123456"
}
```
---
title: Get your organization details
public: false
repo: core-leankit-api
---
# GET /io/organization/:organizationId
Get your organization details.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/organization/478661825 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "id": "478661825",
    "title": "Org title",
    "description": "The org description",
    "hostName": "myaccount",
    "accountId": "478673724",
    "numberOfDaysToRetrieveAnalyticsEventsFor": 365,
    "analytics": [
        {
            "title": "Speed",
            "slug": "speed",
            "workbook": "SpeedDashboard",
            "view": "Dashboard1",
            "description": "View throughput trends and how quickly work flows through your process over time by day, week or month.",
            "titleLong": "Speed",
            "subTitle": null,
            "sortOrder": 1,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Distribution",
            "slug": "distribution",
            "workbook": "CardDistribution",
            "view": "CardsbyAttribute",
            "description": "Analyze how work is distributed by card type, lane and priority to see if the right work is getting done.",
            "titleLong": "Distribution",
            "subTitle": null,
            "sortOrder": 3,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Efficiency",
            "slug": "efficiency",
            "workbook": "EfficiencyDiagram",
            "view": "QueueSize",
            "description": "See the proportion of Active vs. Inactive work in a lane or set of lanes based on card staleness.",
            "titleLong": "Efficiency",
            "subTitle": null,
            "sortOrder": 4,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Planned Percent Complete",
            "slug": "plannedPercent",
            "workbook": "PPCDashboard",
            "view": "Dashboard1",
            "description": "Understand work completion trends and how well you are meeting schedule commitments by day, week or month.",
            "titleLong": "Planned Percent Complete",
            "subTitle": null,
            "sortOrder": 6,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Burndown",
            "slug": "burndown",
            "workbook": "BurndownDashboard",
            "view": "Dashboard1",
            "description": "Determine how much of a planned set of work is complete as of today and what pace you need to set going forward to meet your schedule.",
            "titleLong": "Burndown",
            "subTitle": null,
            "sortOrder": 8,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Exceptions",
            "slug": "exceptions",
            "workbook": "ExceptionsReportContent",
            "view": "",
            "description": "Determine what work is blocked, stale, or missing planned dates so you know where to focus problem resolution.",
            "titleLong": "Exceptions",
            "subTitle": null,
            "sortOrder": 9,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Flow",
            "slug": "flow",
            "workbook": "FlowDashboard",
            "view": "Dashboard1",
            "description": "View throughput trends and how quickly work flows through your process over time.",
            "titleLong": "Flow",
            "subTitle": null,
            "sortOrder": 11,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Assigned Users",
            "slug": "assignedUsers",
            "workbook": "AssignedUsers",
            "view": "Dashboard1",
            "description": "View how work is currently distributed across team members to help balance workload with capacity.",
            "titleLong": "Assigned Users",
            "subTitle": null,
            "sortOrder": 12,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        },
        {
            "title": "Timeline",
            "slug": "timeline",
            "workbook": "timeline",
            "view": "",
            "description": "View cards by planned start date, measured by planned duration",
            "titleLong": "Timeline",
            "subTitle": null,
            "sortOrder": 20,
            "urlTemplate": "https://myaccount.leankit.com/board/{1}/report/{0}",
            "chartType": "HTML",
            "allowClientSideNav": true
        }
    ],
    "zendeskDropboxId": "123456"
}
```
---
title: Create a new planning increment
public: true
repo: core-account-service
---
# POST /io/series/:seriesId/increment
Create a new planning increment.

_Requires the Account Administrator or Team Organizer account role._

### Request Body Properties
|Param|Type|Usage|
|---|---|---|
|`label`*|string|Increment label.|
|`startDate`*|string|Start date of this increment (e.g. "2022-01-01")|
|`endDate`*|string|End date of this increment (e.g. "2022-01-31")|
|`parentPlanningIncrementId`|nullable string|IncrementId to specify as this increment's parent.|

\* Required<br />

### Example Request
```shell
curl POST 'https://myaccount.leankit.com/io/series/10214170098/increment' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic base64encodedauthhere' \
--data-raw '{
    "label": "PI-1",
    "startDate": "2021-05-01",
    "endDate": "2021-06-24",
    "parentPlanningIncrementId": "93942034"
}'
```

### Example Response
```json
{
  "id": "10114169191",
  "label": "PI-1",
  "planningSeriesId": "10214170098",
  "startDate": "2021-05-01",
  "endDate": "2021-06-24",
  "parentPlanningIncrementId": "93942034"
}
```
---
title: Create a new planning series
public: true
repo: core-account-service
---
# POST /io/series
Create a new planning series.

_Requires the Account Administrator or Team Organizer account role._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`label`*|string|The label for the new series.||
|`timeZone`|string|One of [valid timezones](/markdown/01-overview/time-zones.md).||
|`allowAllBoards`|boolean|Set to `true` to make the series available to all boards in your organization.|`false`|
|`boardIds`|array|Specify board ids (as string) that will use this series|[]|

\* Required<br />

### Example Request
```shell
curl POST 'https://myaccount.leankit.com/io/series' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic base64encodedauthhere' \
--data-raw '{
    "label": "New Series"
}'
```

### Example Response
```json
{
  "id": "10214170098",
  "label": "New Series",
  "timeZone": "Etc/GMT",
  "allowAllBoards": false,
  "organizationId": "10000000000",
  "boards": [
    {
      "id": "101000032066894",
      "title": "test board",
      "level": {
        "id": "101000034443626",
        "depth": 2,
        "maxDepth": 3,
        "label": "level one",
        "color": "#2966a3"
      }
    }
  ]
}
```
---
title: Delete a planning increment by id
public: true
repo: core-account-service
---
# DELETE /io/series/:seriesId/increment/:incrementId
Delete a planning increment by id.

_Requires the Account Administrator or Team Organizer account role._

### Example Request
```shell
curl -X DELETE https://myaccount.leankit.com/io/series/394206946/increment/99343503 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Delete a series by id
public: true
repo: core-account-service
---
# DELETE /io/series/:seriesId
Delete a series by id.

_Requires the Account Administrator or Team Organizer account role._

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/series/394206946 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content

---
title: Get cardsIds within a specific increment status category
public: true
repo: core-account-service
openApi: true
operationId: getIncrementCardsByStatus
---
# GET /io/series/:seriesId/increment/:incrementId/status/:category
List the cardIds of cards in the increment that are currently in the increment status category specified by the
`:category` path parameter.

## Path Parameters

| Name | Description | Required | Schema |
| ---- | ----------- | -------- | ------ |
| seriesId | ID of the planning series | Yes | string |
| incrementId | ID of the increment | Yes | string |
| [category](#category-values) | Status category of cards to retrieve | Yes | string |

## Query Parameters
| Name | Description | Required | Schema | Format |
| ---- | ----------- | -------- | ------ | ------ |
| boards | Board ids to filter results to specific boards | no | string | comma-separated values |

### Category Values

The `category` parameter accepts the following values:
- `notStarted` - Cards that have not been started yet
- `inProgress` - Cards that are currently in progress
- `completed` - Cards that are completed
- `committed` - Cards that are committed to the increment
- `unplanned` - Cards that are in the increment but were not originally planned

## Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Successfully retrieved card IDs | [ExpandStatusCategoryResponse](#expandstatuscategoryresponse) |
| 400 | Bad request, invalid parameters | Error |
| 404 | Series or increment not found | Error |

### ExpandStatusCategoryResponse

| Property | Type | Description |
| -------- | ---- | ----------- |
| cardIds | array[string] | List of card IDs in the specified category |
| blockedCardIds | array[string] | Subset of cardIds that are currently blocked |

#### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/series/1234/increment/5678/status/inProgress \
  -H 'Authorization: Basic base64encodedauthhere'
```

#### Example Successful Response
200 OK
```json
{
    "cardIds": [
        "2222",
        "3333"
    ],
    "blockedCardIds": [
        "3333"
    ]
}
```
---
title: Get the status of cards in an increment
public: true
repo: core-account-service
openApi: true
operationId: getIncrementStatus
---
# GET /io/series/:seriesId/increment/:incrementId/status
Enumerates the total number of cards and the number of blocked cards in the increment by status category.

## Path Parameters

| Name | Description | Required | Schema | Format |
| ---- | ----------- | -------- | ------ | ------ |
| seriesId | ID of the planning series | Yes | string | uuid |
| incrementId | ID of the increment | Yes | string | uuid |

## Query Parameters
| Name | Description | Required | Schema | Format |
| ---- | ----------- | -------- | ------ | ------ |
| boards | Board ids to filter results to specific boards | no | string | comma-separated values |

## Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Successfully retrieved increment status | [IncrementStatusResponse](#incrementstatusresponse) |
| 400 | Bad request, invalid parameters | Error |
| 404 | Series or increment not found | Error |

### IncrementStatusResponse

| Property | Type | Description | Required |
| -------- | ---- | ----------- | -------- |
| notStarted | [StatusCategoryCount](#statuscategorycount) | Cards that have not been started yet | Yes |
| inProgress | [StatusCategoryCount](#statuscategorycount) | Cards that are currently in progress | Yes |
| completed | [StatusCategoryCount](#statuscategorycount) | Cards that are completed | Yes |
| committed | [StatusCategoryCount](#statuscategorycount) | Cards that are committed to the increment | Yes |
| unplanned | [StatusCategoryCount](#statuscategorycount) | Cards that are in the increment but were not originally planned | Yes |

### StatusCategoryCount

| Property | Type | Description | Required |
| -------- | ---- | ----------- | -------- |
| total | integer | Total number of cards in this category | Yes |
| blocked | integer | Number of blocked cards in this category | Yes |

## Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/series/1234/increment/5678/status \
  -H 'Authorization: Basic base64encodedauthhere'
```

## Example Successful Response
```json
{
    "notStarted": {
        "total": 2,
        "blocked": 0
    },
    "inProgress": {
        "total": 2,
        "blocked": 1
    },
    "completed": {
        "total": 2,
        "blocked": 0
    },
    "committed": {
        "total": 5,
        "blocked": 1
    },
    "unplanned": {
        "total": 1,
        "blocked": 0
    }
}
```
---
title: Get a specified planning series
public: true
repo: core-account-service
openApi: true
operationId: getPlanningSeries
---
# GET /io/series/:seriesId
Get a planning series by id.


### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/series/1234 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example successful response
200 OK
```json
{
    "id": "10114170098",
    "label": "Planning Series 2",
    "timeZone": "Etc/GMT",
    "allowAllBoards": false,
    "organizationId": "48392349",
    "boards": [
        {
            "id": "101000032066894",
            "title": "test board",
            "level": {
                "id": "101000034443626",
                "depth": 2,
                "maxDepth": 3,
                "label": "test label",
                "color": "#2966a3"
            }
        }
    ]
}
```
---
title: Get a list of increments for a planning series
public: true
repo: core-account-service
openApi: true
operationId: listSeriesIncrements
---
# GET /io/series/:seriesId/increment
Get a list of increments and child increments for a planning series.

### Query Params
|Param|Type|Usage|Default|
|-----|-----|-----|-----|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|200|
|`sortBy`|enumeration|Set the ordering of the results.|dateAsc|

Valid `sortBy` options:
- dateDesc
- dateAsc

### Example Requests
```shell
curl -X GET \
  https://myaccount.leankit.com/io/series/12345/increment \
  -H 'Authorization: Basic base64encodedauthhere'

curl -X GET \
  https://myaccount.leankit.com/io/series/12345/increment?sortBy=dateDesc&limit=1&offset=1 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example successful response

200 OK
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 100,
        "startRow": 1,
        "endRow": 2
    },
    "increments": [
        {
            "id": "1014169191",
            "label": "PI-1",
            "planningSeriesId": "12345",
            "startDate": "2021-10-01",
            "endDate": "2021-11-15",
            "parentPlanningIncrementId": null
            "increments" [
                {
                    "id": "1014170402",
                    "label": "Sub-1",
                    "planningSeriesId": "12345",
                    "startDate": "2022-02-01",
                    "endDate": "2022-02-14",
                    "parentPlanningIncrementId": "1014169191"
                },
                {
                    "id": "1014170403",
                    "label": "Sub-2",
                    "planningSeriesId": "12345",
                    "startDate": "2022-02-15",
                    "endDate": "2022-02-28",
                    "parentPlanningIncrementId": "1014169191"
                }
            ]
        },
        {
            "id": "1014170401",
            "label": "PI-2",
            "planningSeriesId": "12345",
            "startDate": "2022-02-01",
            "endDate": "2022-02-28",
            "parentPlanningIncrementId": null,
            "increments": []
        }
    ]
}
```
---
title: Get a list of planning series for an account
public: true
repo: core-account-service
openApi: true
operationId: listPlanningSeries
---

# GET /io/series
Get a list of planning series for an account.

### Query Params
|Param|Type|Usage|Default|
|-----|-----|------|-------|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of cards to be returned.|100|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/series \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example successful response

200 OK
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 100,
        "startRow": 1,
        "endRow": 2
    },
    "series": [
        {
            "id": "10114168785",
            "label": "Planning Series 1",
            "timeZone": "Etc/GMT",
            "allowAllBoards": false,
            "organizationId": "10100000101",
            "hideOutdatedIncrements": false
        },
        {
            "id": "10114168786",
            "label": "Planning Series 2",
            "timeZone": "Etc/GMT",
            "allowAllBoards": false,
            "organizationId": "10100000101",
            "hideOutdatedIncrements": true
        }
    ]
}
```
---
title: Update an existing planning increment
public: true
repo: core-account-service
---
# PATCH /io/series/:seriesId/increment/:incrementId
Update an existing planning increment.

_Requires the Account Administrator or Team Organizer account role._

### Request Body Properties
|Param|Type|Usage|
|---|---|---|
|`label`|string|Increment label.|
|`startDate`|string|Start date of this increment (e.g. "2022-01-01")|
|`endDate`|string|End date of this increment (e.g. "2022-01-31")|

Note: _All properties are optional, but at least one must be included._

### Example Request
```shell
curl PATCH 'https://myaccount.leankit.com/io/series/10214170098/increment/30420342' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic base64encodedauthhere' \
--data-raw '{
    "label": "Edited Increment label",
    "startDate": "2022-02-01"
}'
```

### Example Response
```json
{
    "id": "10114169191",
    "label": "PI-1",
    "planningSeriesId": "10114168786",
    "startDate": "2022-01-01",
    "endDate": "2022-01-31",
    "parentPlanningIncrementId": null
}
```
---
title: Update an existing planning series
public: true
repo: core-account-service
---
# PATCH /io/series/:seriesId
Update an existing planning series.

_Requires the Account Administrator or Team Organizer account role._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`label`*|string|The label for the new series.||
|`timeZone`|string|One of [valid timezones](/markdown/01-overview/time-zones.md).||
|`allowAllBoards`|boolean|Set to `true` to make the series available to all boards in your organization.|`false`|
|`boardIds`|array|Specify board ids (as string) that will use this series|[]|

\* Required<br />

### Example Request
```shell
curl PATCH 'https://myaccount.leankit.com/io/series/10214170098' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic base64encodedauthhere' \
--data-raw '{
    "label": "Edited Series label",
    "allowAllBoards": true
}'
```

### Example Response
```json
{
  "id": "10214170098",
  "label": "Edited Series label",
  "timeZone": "Etc/GMT",
  "allowAllBoards": true,
  "organizationId": "10000000000",
  "boards": [
    {
      "id": "101000032066894",
      "title": "test board",
      "level": {
        "id": "101000034443626",
        "depth": 2,
        "maxDepth": 3,
        "label": "test label",
        "color": "#2966a3"
      }
    }
  ]
}
```
---
title: Delete a tag on a board
public: true
repo: core-board-service
---
# DELETE /io/board/:boardId/tag
Delete a tag on a board.

_Requires `enableTagManagement` to be `true` for the account and the requesting user to be a `boardAdministrator`._

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`tags`*|string array|List of tags to remove||


### Example Request
```json
{
    "tags": [ "tag1", "tag2" ]
}
```

### Example Successful Response
204 No Content

---
title: Get a list of tags on a board
public: true
repo: core-board-service
---
# GET /io/board/:boardId/tag
Get a list of tags on a board. The response contains a key for each tag where the value is the number of times the tag is used on the board.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/board/10113014456/tag \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "tags": {
        "tag2": 2,
        "tag3": 1,
        "tag1": 1
    }
}
```
---
title: Rename or merge tags on a board
public: true
repo: core-board-service
---
# POST /io/board/:boardId/tag/replace
Rename or merge tags on a board.

_Requires `enableTagManagement` to be `true` for the account and the requesting user to be a `boardAdministrator`._

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`tags`*|string array|List of tags to be replaced||
|`replaceWith`*|string|The new tag to replace with||


### Example Request
```json
{
    "tags": [ "tag1", "tag2" ],
    "replaceWith": "newTag"
}
```

### Example Successful Response
204 No Content

---
title: Add subteams to a team
public: true
repo: core-account-service
---
# POST /io/team/:teamId/subteam
Add subteams to a team. All subteams and its members (subteams and users) are granted the same privileges assigned to the team.

_Requires authentication as account administrator or team manager who created the team._ \
_Team and subteams must be enabled._ \
_Cannot be used with built-in teams: Everyone and External Users._ \
_A team can only be a direct subteam of one team._ \
_A team can have multiple direct subteams._ \
_A team cannot be a subteam of itself or any of its nested subteams._ \
_The maximum depth of nested subteams is 5._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`teamIds`*|array of integer id|team ids to be added as direct subteams,  min: 1, max: 10||

\* required

### Example Request
```
curl -X POST \
  https://myaccount.leankit.com/io/team/12345678/subteam' \
  -H 'Authorization: Basic base64encodedauth' \
  -d '{"teamIds": [ "1001001", "1001006" ]}'
```

### Example Successful Response

201 Created




---
title: Add users to a team
public: true
repo: core-account-service
---
# POST /io/team/:teamId/user
Add users to a team.  All users of a team are granted the same privileges assigned to the team.

_Requires authentication as account administrator or team manager who created the team._ \
_Team must be enabled to add users to it._ \
_Cannot be used with built-in teams: Everyone and External Users._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`userIds`*|array of integer id|user ids to be added to the team. no deleted users, no system users, no support account users, min: 1, max: 100||

\* required

### Example Request
```
curl -X POST \
  https://myaccount.leankit.com/io/team/12345678/user' \
  -H 'Authorization: Basic base64encodedauth' \
  -d '{"userIds": [ "1001001", "1001006" ]}'
```


### Example Successful Response

201 Created




---
title: Create a team
public: true
repo: core-account-service
---
# POST /io/team/
Create a team. Teams are enabled by default. Teams are not associated with any other teams, boards, or users when created. You must add parent teams, subteams, users and boards to the team after it is created.

_Requires authentication as account administrator or team manager._ /
_Team titles must be unique._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`title`*|string|Team title, Min: 1, Max: 255||
|`description`|string|Team description, Max: 500|""|
|`enabled`|boolean|Enabled|true|

\* required

### Example Request
Minimum fields required
```
curl -X POST \
  https://myaccount.leankit.com/io/team' \
  -H 'Authorization: Basic base64encodedauth' \
  -d '{ "title": "The title of the team" }'
```

All fields
```
curl -X POST \
  https://myaccount.leankit.com/io/team' \
  -H 'Authorization: Basic base64encodedauth' \
  -d '{ "title": "The title of the team", "description": "My first team", "enabled": true }'
```

### Example Successful Response

201 Created
```json
{
    "id": "10626232120",
    "title": "Another Team",
    "description": null,
    "createdOn": "2023-09-25T13:28:20.497Z",
    "createdBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "Jane Doe"
    },
    "lastModifiedOn": "2023-09-25T13:28:20.497Z",
    "lastModifiedBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "Jane Doe"
    },
    "enabled": true,
    "organizationId": "101040097",
    "teamType": {
        "key": "standard",
        "label": "Standard"
    }
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer id|internal unique id|
|`title`|string||
|`description`|string||
|`createdOn`|date||
|`createdBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`lastModifiedOn`|date||
|`lastModifiedBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`enabled`|boolean|team is enabled/disabled|
|`organizationId`|integer|internal unique id of organization|
|`teamType`|enum|key is one of: `everyone`, `external`, `standard`, label is text equivalent|




---
title: Delete a team
public: true
repo: core-account-service
---
# DELETE /io/team/:teamId
Delete a team. Teams and all associated data such as board memberships, user membership, and subteam relationships are permanantly deleted and cannot be recovered.

_Requires authentication as account administrator or team manager who created the team._ \
_Cannot be used with built-in teams: Everyone and External Users._

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/team/100100 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

204 No Content



---
title: Get a team
public: true
repo: core-account-service
---
# GET /io/team/:teamId
Get a team.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/team/100100 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "id": "100100",
    "title": "First Team",
    "description": null,
    "createdOn": "2023-06-22T18:32:02.843Z",
    "createdBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "Jane Doe"
    },
    "lastModifiedOn": "2023-06-22T18:32:02.843Z",
    "lastModifiedBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "Jane Doe"
    },
    "enabled": true,
    "organizationId": "101040097",
    "teamType": {
        "key": "standard",
        "label": "Standard"
    }
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer id|internal unique id|
|`title`|string||
|`description`|string||
|`createdOn`|date||
|`createdBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`lastModifiedOn`|date||
|`lastModifiedBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`enabled`|boolean|team is enabled/disabled|
|`organizationId`|integer|internal unique id of organization|
|`teamType`|enum|key is one of: `everyone`, `external`, `standard`, label is text equivalent|
---
title: Get a list of team's boards
public: true
repo: core-account-service
---
# GET /io/team/:teamId/board
Get a list of all boards the team has been assigned to either directly or inherited via nested teams.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first board to be returned|0|
|`limit`|integer|Set the number of boards to be returned|200|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/team/100100/board \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "boards": [
        {
            "boardId": "10626194350",
            "boardTitle": "New Network Team",
            "effectiveRole": "boardManager",
            "hasDirectRole": false,
            "hasInheritedRole": true,
            "hasRoleMismatch": false,
            "teams": [
                {
                    "teamId": "10626208485",
                    "teamTitle": "Primary Team",
                    "role": "boardManager",
                    "type": "inherited"
                }
            ]
        },
        {
            "boardId": "10626225453",
            "boardTitle": "Something",
            "effectiveRole": "boardReader",
            "hasDirectRole": true,
            "hasInheritedRole": true,
            "hasRoleMismatch": true,
            "teams": [
                {
                    "teamId": "10626208485",
                    "teamTitle": "Primary Team",
                    "role": "boardReader",
                    "type": "inherited"
                },
                {
                    "teamId": "100100",
                    "teamTitle": "First Team",
                    "role": "boardUser",
                    "type": "direct"
                }
            ]
        },
        {
            "boardId": "10626225499",
            "boardTitle": "Board With Teams",
            "effectiveRole": "boardUser",
            "hasDirectRole": true,
            "hasInheritedRole": false,
            "hasRoleMismatch": false,
            "teams": [
                {
                    "teamId": "100100",
                    "teamTitle": "First Team",
                    "role": "boardUser",
                    "type": "direct"
                }
            ]
        }
    ]
}
```


### Response Properties
|Property|Type|Note|
|--------|----|----|
|`pageMeta`|object||
|`pageMeta.totalRecords`|integer|total number of boards|
|`pageMeta.offset`|integer|offset used in query|
|`pageMeta.limit`|integer|limit used in query|
|`pageMeta.startRow`|integer|start row of returned boards|
|`pageMeta.endRow`|integer|end row of returned boards|
|`boards`|array of boards||
|`boards[].boardId`|integer id|internal unique id|
|`boards[].boardTitle`|string||
|`boards[].effectiveRole`|enum|one of: `boardReader`, `boardUser`, `boardManager`, `boardAdministrator`, `boardCreator`|
|`boards[].hasDirectRole`|boolean|the team is directly assigned to the board|
|`boards[].hasInheritedRole`|boolean|the team is assigned to the board due to being a subteam of a team that is directly assigned to the board|
|`boards[].hasRoleMismatch`|boolean|the team is assigned to the board via multiple paths with different roles|
|`boards[].teams`|array of object|teams that are the source of the board assignment|
|`boards[].teams[].teamId`|integer id|internal unique id|
|`boards[].teams[].teamTitle`|string||
|`boards[].teams[].role`|enum|one of: `boardReader`, `boardUser`, `boardManager`, `boardAdministrator`, `boardCreator`|
|`boards[].teams[].type`|enum|one of: `direct`, `inherited`, defines if the permission is applied directly to the team or inherited by being a subteam of a team with the assignment|

---
title: Get a list of team's subteams
public: true
repo: core-account-service
---
# GET /io/team/:teamId/subteam
Get a list of subteams assigned directly to the team.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first subteam to be returned|0|
|`limit`|integer|Set the number of subteams to be returned|200|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/team/100100/subteam?offset=0&limit=10 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 10,
        "startRow": 1,
        "endRow": 2
    },
    "teams": [
        {
            "id": "10626208490",
            "title": "Team A",
            "description": null,
            "createdOn": "2023-06-22T18:40:52.623Z",
            "createdBy": {
                "id": "101040602",
                "emailAddress": "admin@company.com",
                "fullName": "John Smith"
            },
            "lastModifiedOn": "2023-06-22T18:40:52.623Z",
            "lastModifiedBy": {
                "id": "101040602",
                "emailAddress": "admin@company.com",
                "fullName": "John Smith"
            },
            "enabled": true,
            "organizationId": "101040097",
            "includedOn": "2023-06-22T18:41:54.840Z",
            "totalUserCount": 5,
            "subteamCount": 1,
            "teamType": {
                "key": "standard",
                "label": "Standard"
            }
        }, {
            "id": "10626208491",
            "title": "Team B",
            "description": null,
            "createdOn": "2023-06-22T18:40:52.623Z",
            "createdBy": {
                "id": "101040602",
                "emailAddress": "admin@company.com",
                "fullName": "Jane Doe"
            },
            "lastModifiedOn": "2023-06-22T18:40:52.623Z",
            "lastModifiedBy": {
                "id": "101040602",
                "emailAddress": "admin@company.com",
                "fullName": "Jane Doe"
            },
            "enabled": true,
            "organizationId": "101040097",
            "includedOn": "2023-06-22T18:41:54.840Z",
            "totalUserCount": 4,
            "subteamCount": 2,
            "teamType": {
                "key": "standard",
                "label": "Standard"
            }
        }
    ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`pageMeta`|object||
|`pageMeta.totalRecords`|integer|total number of subteams|
|`pageMeta.offset`|integer|offset used in query|
|`pageMeta.limit`|integer|limit used in query|
|`pageMeta.startRow`|integer|start row of returned subteams|
|`pageMeta.endRow`|integer|end row of returned subteams|
|`teams`|array of subteams||
|`teams[].id`|integer id|internal unique id|
|`teams[].title`|string||
|`teams[].description`|string||
|`teams[].createdOn`|date||
|`teams[].createdBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`teams[].lastModifiedOn`|date||
|`teams[].lastModifiedBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`teams[].enabled`|boolean|team is enabled/disabled|
|`teams[].organizationId`|integer|internal unique id of organization|
|`teams[].includedOn`|date|date when the team was added as a subteam|
|`teams[].totalUserCount`|integer|number of distinct users in the subteam and all nested subteams|
|`teams[].subteamCount`|integer|number of subteams, not including nested subteams|
|`teams[].teamType`|enum|key is one of: `everyone`, `external`, `standard`, label is text equivalent|
---
title: Get a list of team's users
public: true
repo: core-account-service
---
# GET /io/team/:teamId/user
Get a list of users assigned directly to the team - does not include users assigned to subteams.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first user to be returned|0|
|`limit`|integer|Set the number of users to be returned|200|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/team/100100/user?offset=0?limit=10 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "pageMeta": {
        "totalRecords": 3,
        "offset": 0,
        "limit": 10,
        "startRow": 1,
        "endRow": 3
    },
    "users": [
        {
            "id": "10626208486",
            "emailAddress": "bob@company.com",
            "enabled": true,
            "firstName": "Bob",
            "lastName": "User",
            "includedOn": "2023-06-22T18:36:08.070Z",
            "externalUserName": "",
            "licenseType": 0
        }, {
            "id": "10626208487",
            "emailAddress": "jane@company.com",
            "enabled": true,
            "firstName": "Jane",
            "lastName": "Doe",
            "includedOn": "2023-06-22T18:36:08.070Z",
            "externalUserName": "",
            "licenseType": 0
        }, {
            "id": "10626208488",
            "emailAddress": "john@company.com",
            "enabled": true,
            "firstName": "John",
            "lastName": "Smith",
            "includedOn": "2023-06-22T18:36:08.070Z",
            "externalUserName": "",
            "licenseType": 0
        }
    ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`pageMeta`|object||
|`pageMeta.totalRecords`|integer|total number of users|
|`pageMeta.offset`|integer|offset used in query|
|`pageMeta.limit`|integer|limit used in query|
|`pageMeta.startRow`|integer|start row of returned users|
|`pageMeta.endRow`|integer|end row of returned users|
|`users`|array of users||
|`users[].id`|integer id|internal unique id|
|`users[].emailAddress`|string||
|`users[].enabled`|boolean||
|`users[].firstName`|string||
|`users[].lastName`|string||
|`users[].includedOn`|date||
|`users[].externalUserName`|string||
|`users[].licenseType`|int|0 = `full`, 2 = `reader`|
---
title: Get a list of teams
public: true
repo: core-account-service
---
# GET /io/team
Get a list of all teams for the organization.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first team to be returned|0|
|`limit`|integer|Set the number of teams to be returned|200|

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/team?offset=0&limit=10 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
  {
    "pageMeta": {
          "totalRecords": 5,
          "offset": 0,
          "limit": 10,
          "startRow": 1,
          "endRow": 5
    },
    "teams": [ {
          "id": "10626168169",
          "title": "Everyone",
          "description": "Built-in team of all the organization’s users",
          "createdOn": "2022-10-06T18:44:48.870Z",
          "createdBy": {
              "id": "11000011",
              "emailAddress": "systemuser@leankit.com",
              "fullName": "System User"
          },
          "lastModifiedOn": "2022-10-06T18:44:48.870Z",
          "lastModifiedBy": {
              "id": "11000011",
              "emailAddress": "systemuser@leankit.com",
              "fullName": "System User"
          },
          "enabled": true,
          "organizationId": "101040097",
          "teamType": {
              "key": "everyone",
              "label": "Everyone"
        } }, {
          "id": "10626168170",
          "title": "External",
          "description": "Built-in team of all external users",
          "createdOn": "2022-10-06T18:44:48.873Z",
          "createdBy": {
              "id": "11000011",
              "emailAddress": "systemuser@leankit.com",
              "fullName": "System User"
          },
          "lastModifiedOn": "2022-10-06T18:44:48.873Z",
          "lastModifiedBy": {
              "id": "11000011",
              "emailAddress": "systemuser@leankit.com",
              "fullName": "System User"
          },
          "enabled": true,
          "organizationId": "101040097",
          "teamType": {
              "key": "external",
              "label": "External Users"
        } }, {
          "id": "10626208490",
          "title": "First Team",
          "description": null,
          "createdOn": "2023-06-22T18:40:52.623Z",
          "createdBy": {
              "id": "101040602",
              "emailAddress": "myadmin@company.com",
              "fullName": "Jane Doe"
          },
          "lastModifiedOn": "2023-06-22T18:40:52.623Z",
          "lastModifiedBy": {
              "id": "101040602",
              "emailAddress": "myadmin@company.com",
              "fullName": "Jane Doe"
          },
          "enabled": true,
          "organizationId": "101040097",
          "teamType": {
              "key": "standard",
              "label": "Standard"
          } },
          ... other teams ...
      ]
}
```


### Response Properties
|Property|Type|Note|
|--------|----|----|
|`pageMeta`|object||
|`pageMeta.totalRecords`|integer|total number of teams|
|`pageMeta.offset`|integer|offset used in query|
|`pageMeta.limit`|integer|limit used in query|
|`pageMeta.startRow`|integer|start row of returned teams|
|`pageMeta.endRow`|integer|end row of returned teams|
|`teams`|array of teams||
|`teams[].id`|integer id|internal unique id|
|`teams[].title`|string||
|`teams[].description`|string||
|`teams[].createdOn`|date||
|`teams[].createdBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`teams[].lastModifiedOn`|date||
|`teams[].lastModifiedBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`teams[].enabled`|boolean|team is enabled/disabled|
|`teams[].organizationId`|integer|internal unique id of organization|
|`teams[].teamType`|enum|key is one of: `everyone`, `external`, `standard`, label is text equivalent|
---
title: Remove subteams from a team
public: true
repo: core-account-service
---
# DELETE /io/team/:teamId/subteam
Remove directly assigned subteams from a team. Any permissions granted to the subteams and their members through membership in the parent team are removed.

_Requires authentication as account administrator or team manager who created the team._ \
_Teams that are not enabled cannot be edited._ \
_Cannot be used with built-in teams: Everyone and External Users._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`teamIds`*|array of integer id|team ids to be removed as subteams, min: 1, max: 10||

\* required

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/team/100100/subteam \
  -H 'Authorization: Basic base64encodedauthhere' \
  -d '{"teamIds": [ "1001001", "1001006" ]}'
```

### Example Successful Response

204 No Content



---
title: Remove users from a team
public: true
repo: core-account-service
---
# DELETE /io/team/:teamId/user
Remove users from a team. This will only work with direct assignments, it will not remove a user that is part of the team via their assignment to a subteam. Any permissions granted to the user as a member of the team are removed.

_Requires authentication as account administrator or team manager who created the team._ \
_Teams that are not enabled cannot be edited._ \
_Cannot be used with built-in teams: Everyone and External Users._


### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`userIds`*|array of integer id|user ids to be removed from the team, min: 1, max: 10||

\* required

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/team/100100/user \
  -H 'Authorization: Basic base64encodedauthhere' \
  -d '{"userIds": [ "1001001", "1001006" ]}'
```

### Example Successful Response

204 No Content



---
title: Update a team
public: true
repo: core-account-service
---
# PATCH /io/team/:teamId
Update a team. The team title, the team description and the enabled status can be updated.

_Requires authentication as account administrator or team manager who created the team._ \
_Team titles must be unique._ \
_Teams that are not enabled cannot be edited, they can only be re-enabled._ \
_Cannot disable built-in teams: Everyone and External Users._ \
_Teams that are not enabled are treated as if they do not exist. However, if they are re-enabled they will retain all users, subteams and board permissions._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|----|
|`title`|string|Team title, Min: 1, Max: 255||
|`description`|string|Team description, Max: 500|""|
|`enabled`|boolean|Enabled|true|

### Example Request
```
curl -X PATCH \
  https://myaccount.leankit.com/io/team/12345678' \
  -H 'Authorization: Basic base64encodedauth' \
  -d '{ "title": "Updated team", "description": "My first team is updated", "enabled": true }'
```

### Example Successful Response

200 Success
```json
{
    "id": "10626232120",
    "title": "My Team",
    "description": null,
    "createdOn": "2023-09-25T13:28:20.497Z",
    "createdBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "John Smith"
    },
    "lastModifiedOn": "2023-09-25T13:31:43.960Z",
    "lastModifiedBy": {
        "id": "101040602",
        "emailAddress": "admin@company.com",
        "fullName": "John Smith"
    },
    "enabled": true,
    "organizationId": "101040097",
    "teamType": {
        "key": "standard",
        "label": "Standard"
    }
}
```
### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|integer id|internal unique id|
|`title`|string||
|`description`|string||
|`createdOn`|date||
|`createdBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`lastModifiedOn`|date||
|`lastModifiedBy`|object|example: `{ id: "101040602", emailAddress: "admin@company.com", fullName: "Jane Doe" }`|
|`enabled`|boolean|team is enabled/disabled|
|`organizationId`|integer|internal unique id of organization|
|`teamType`|enum|key is one of: `everyone`, `external`, `standard`, label is text equivalent|


---
title: Create an authentication token
public: true
repo: core-leankit-api
---
# POST /io/auth/token
Create an authentication token. Make sure that you choose a meaningful description when you post, and record the token received from this request. This is the only time it is displayed.

> __You can also manage your tokens by choosing the "My API Tokens" tab in your LeanKit User Profile.__

### Request Properties
|Param|Type|Usage|Default|
|-----|----|-----|-------|
|`description`*|string|Description of the token||

### Sample Request
```json
{
    "description": "The token description"
}
```

### Example Successful Response
201 Created

```json
{
    "id": "101000029635727",
    "token": "theauthtoken",
    "description": "test token",
    "createdOn": "2020-01-14T22:28:10.798Z"
}
```

---
title: Delete an authentication token
public: true
repo: core-leankit-api
---
# DELETE /io/auth/token/:tokenId
Delete an authentication token.

> __You can also manage your tokens by choosing the "My API Tokens" tab in your LeanKit User Profile.__

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/auth/token/124321442234 \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response
204 No Content
---
title: Get the list of authentication tokens
public: true
repo: core-leankit-api
---
# GET /io/auth/token
Get the list of authentication tokens.

> __You can also manage your tokens by choosing the "My API Tokens" tab in your LeanKit User Profile.__

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/auth/token \
  -H 'Authorization: Basic base64encodedauthhere'
```

### Example Successful Response

200 Success
```json
{
    "tokens": [
        {
            "id": "1",
            "description": "Test Token",
            "createdOn": "2001-01-01T00:00:00Z"
        },
        {
            "id": "10112979107",
            "description": "Postman Token",
            "createdOn": "2017-08-29T19:09:43Z"
        }
    ]
}
```
---
public: false
title: Upload a user avatar
repo: core-account-service
---
# POST /io/user/avatar
Upload an avatar image for a user.

### Validation

Uploaded avatar will be validated against the following criteria:
|attribute|validation|
|---|---|
|`width`| min `128px`, max `1024px`|
|`height`| min `128px`, max `1024px`|
|`file type`| must be a `jpg`, `jpeg`, or `png`|
|`file size`| must not exceed `10mb`|


### Example Request
The payload is a `multipart/form-data` payload with a `attachmentFile` form field name.
```
Content-Type: multipart/form-data; boundary=boundary
Content-Length: 354

--boundary--
Content-Disposition: form-data; name="attachmentFile"; filename="avatar.png"
Content-Type: application/octet-stream

<avatar.png>
--boundary--
```

### Example Successful Response

204 No Content
---
public: false
title: Get a user avatar
repo: core-account-service
---
# GET /io/user/:userId/avatar
Returns avatar image for a given user.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`s`|integer|Specify the size in pixels of the avatar to be returned ( max 256px )|25|


### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/user/25012/avatar' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

Possible response content types are image/jpeg, and image/png.

200 Success
```
(avatar contents)
```
---
public: true
title: Change a user's password
repo: core-account-service
---
# PATCH /io/user/:userId/password
Change a user's password.

_Requires account administrator access._

### Request Properties
|Param|Type|Usage|Default|
|---|---|---|---|
|`password`*|string|The user's password|

### Example Request
```json
{
  "password": "anotherSecurePassword"
}
```

### Example Successful Response

200 Success
```json
{
  "id": "10113041625",
  "username": "someone@mycompany.com",
  "firstName": "SomeOne",
  "lastName": "Else",
  "fullName": "SomeOne Else",
  "emailAddress": "someone@mycompany.com",
  "lastAccess": null,
  "dateFormat": "MM/dd/yyyy",
  "administrator": true,
  "enabled": false,
  "deleted": false,
  "organizationId": "10187654101",
  "boardCreator": true,
  "timeZone": "America/New_York",
  "licenseType": "full",
  "externalUserName": null,
  "avatar": "https://bigfood.localkanban.com/avatar/show/10113041625/?s=25",
  "settings": {},
  "boardRoles": [
      {
          "boardId": "10100000505",
          "WIP": null,
          "role": {
              "key": "boardReader",
              "value": 1,
              "label": "Reader"
          }
      }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string|See [valid timezones](/markdown/01-overview/time-zones.md).|
|`licenseType`|string|`full`, `reader`, or `focused`. Only present if `reader` or `focused` users are enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|


---
public: false
title: Get the requesting user's context information
repo: core-account-service
---
# GET /io/user/context
Returns `context` data for the requesting user. This endpoint is primarily intended for use by the LeanKit UI. The response consists of `user`, `account`, and `organization` information.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/user/context' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "user": {
        "id": "25035",
        "username": "someone@leankit.com",
        "firstName": "Some",
        "lastName": "One",
        "fullName": "Some One",
        "emailAddress": "someone@leankit.com",
        "lastAccess": "2020-01-06T18:51:48Z",
        "dateFormat": "yyyy/MM/dd",
        "timeZone": "Eastern Standard Time",
        "leanKitCommunicationsRead": true,
        "administrator": true,
        "boardCreator": true,
        "systemAdministrator": true,
        "accountOwner": true,
        "supportAccount": false,
        "createdOn": "2015-04-14T20:48:58Z",
        "licenseType": "full",
        "avatarType": "gravatar",
        "olsonTimeZone": "America/New_York",
        "wasInvited": false,
        "settings": {
            "useMondayForCalendarWeekViewStart": true,
            "dialogShownForRange": "First",
            "locale": "en-US"
        }
    },
    "account": {
        "id": "10100000303",
        "country": "UNITED STATES",
        "region": "NEW YORK",
        "expiresOn": null,
        "createdOn": "2014-12-11T21:31:09Z",
        "adminsContact": null,
        "policiesUrl": null,
        "owner": {
            "id": "25035",
            "username": "someone@leankit.com",
            "lastName": "One",
            "fullName": "Some One",
            "firstName": "Some",
            "emailAddress": "someone@leankit.com"
        },
        "activeUsers": 98,
        "closeDate": "2014-12-11T23:54:24Z",
        "settings": {
            "userLimit": 903,
            "enableSearch": true,
            "defaultRoleId": 4,
            "allowComments": true,
            "enableFilters": true,
            "enableMyCards": true,
            "enableWipLimit": true,
            "archiveCardDays": 2,
            "disableRssFeeds": false,
            "allowAttachments": true,
            "enableTaskBoards": true,
            "enableUserDevice": false,
            "enableUserGuides": true,
            "allowAddCardTypes": true,
            "allowAllTemplates": true,
            "allowBoardCloning": true,
            "enableCardHistory": true,
            "enableExportCards": true,
            "enableImportCards": true,
            "enableReaderUsers": true,
            "enableGlobalSearch": true,
            "enableLanePolicies": true,
            "enableSharedBoards": true,
            "enableSingleSignOn": false,
            "enableFocusedUsers": true,
            "enableSavedFilters": true,
            "defaultNewBoardRole": null,
            "disableCalendarView": true,
            "enableTagManagement": true,
            "enableActivityStream": true,
            "enableCardDelegation": false,
            "enableSelectAllUsers": false,
            "cardAttachmentMaxSize": 77800,
            "classOfServiceEnabled": true,
            "enableCustomBoardUrls": true,
            "externalCardIdEnabled": true,
            "allowTaskTypeFiltering": true,
            "enableAdvancedSecurity": true,
            "enableBoardCreatorRole": true,
            "enableCustomCardFields": true,
            "enableInvitationSystem": true,
            "enableLaneSubscription": true,
            "enableReportingApiTags": true,
            "enableUserAdminReports": true,
            "maxNumberOfInvitations": 200,
            "allowedSharedBoardRoles": 1,
            "enableImportExportCards": true,
            "enableReportingApiLanes": true,
            "enableReportingApiTasks": true,
            "enableSuspensionWarning": false,
            "disallowedFileExtensions": null,
            "enableDrillThroughBoards": true,
            "enableExportBoardHistory": true,
            "allowBoardTemplatesCreate": true,
            "allowMultiUserAssignments": true,
            "enablePlanviewIntegration": false,
            "allowCardsInBoardTemplates": true,
            "enableAdvancedRoleSecurity": true,
            "enableOrganizationSettings": true,
            "enableReportingApiComments": true,
            "enableCardHistoryHealthTab": true,
            "allowMoveCardsBetweenBoards": true,
            "allowRepliableNotifications": true,
            "enableConnectedCardsGallery": true,
            "enableRealTimeCommunication": false,
            "enableReportingApiTaskLanes": false,
            "allowColorForClassOfServices": false,
            "allowInvitationsFromAllUsers": false,
            "enableReportingApiCardExport": true,
            "enableSearchByInternalCardId": true,
            "allowSeparateCardAndTaskTypes": true,
            "enableReportingApiConnections": true,
            "enableReportingApiCustomFields": true,
            "enableReportTimelineActualDate": true,
            "enablePlanviewIntegrationForE1": true,
            "allowBoardCreationFromTemplates": true,
            "allowBoardTemplatesImportExport": true,
            "allowHorizontalSplitInBoardEdit": true,
            "disableDisallowedFileExtensions": false,
            "enableMultipleDrillThroughBoards": true,
            "enableReportingApiBlockedHistory": true,
            "enablePlanviewIntegrationForPPMP": true,
            "enableReportingApiCardLaneHistory": true,
            "reportingApiTokenExpirationInMinutes": 10080,
            "subscribeUsersToAssignedCardsByDefault": true,
            "numberOfDaysToRetrieveAnalyticsEventsFor": 365,
            "enableReportingApiCurrentUserAssignments": true,
            "reportingApiResponseCacheDurationInMinutes": 1440,
            "enableReportingApiHistoricalUserAssignments": true,
            "enableBoardLevels": true,
            "enableBoardLegend": true,
            "customCardFieldCountLimit": 8,
            "enableMultiParentConnections": true
        },
        "accountStatus": "active",
        "accountType": "leanKitForScaledTeams",
        "editionType": "customer"
    },
    "organization": {
        "id": "10187654101",
        "title": "New Bigfood",
        "description": "This is the description for the Org Id 10187654101",
        "hostName": "bigfood",
        "advancedSecurity": {
            "strongPasswordEnabled": false,
            "minimumLengthEnabled": false,
            "requireUppercaseEnabled": false,
            "requireNumericEnabled": false,
            "requireSpecialCharacterEnabled": false,
            "lengthOfPassword": 3,
            "accountLockEnabled": false,
            "accountLockInterval": 0,
            "maxFailedLoginAttempts": 3,
            "preferencesEnabled": false,
            "disallowedFileExtensions": null,
            "disableRssFeeds": false,
            "disableGenericLogin": false,
            "disableRememberMe": false
        }
    }
}
```
---
public: true
title: Create a user
repo: core-account-service
---
# POST /io/user
Creates a new user.

_Requires account administrator access._

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`emailAddress`*|string|||
|`firstName`*|string|||
|`lastName`*|string|||
|`password`*|string|||
|`timeZone`|string|See [valid timezones](/markdown/01-overview/time-zones.md).|Etc/GMT|
|`enabled`|boolean||`true`|
|`administrator`|boolean||`false`|
|`boardCreator`|boolean||`false`|
|`dateFormat`|string|`MM/dd/yyyy`, `dd/MM/yyyy`, or `yyyy/MM/dd`|`MM/dd/yyyy`|
|`licenseType`|enumeration|Only available if `reader` users are enabled for the account. Possible values:<br />`full`<br />`reader`|`full`|
|`externalUserName`|string|||

### Minimal Request
```json
{
  "emailAddress": "someone@mycompany.com",
  "firstName": "Some",
  "lastName": "One",
  "password": "supersecurepassword1"
}
```

### Example Successful Response

200 Success
```json
{
  "id": "10113041625",
  "username": "someone@mycompany.com",
  "firstName": "Some",
  "lastName": "One",
  "fullName": "Some One",
  "emailAddress": "someone@mycompany.com",
  "lastAccess": null,
  "dateFormat": "MM/dd/yyyy",
  "administrator": false,
  "enabled": true,
  "deleted": false,
  "organizationId": "10187654101",
  "boardCreator": false,
  "timeZone": "Etc/GMT",
  "licenseType": "full",
  "externalUserName": null,
  "avatar": "https://bigfood.localkanban.com/avatar/show/10113041625/?s=25",
  "settings": {},
  "boardRoles": [
      {
          "boardId": "10100000505",
          "WIP": null,
          "role": {
              "key": "boardReader",
              "value": 1,
              "label": "Reader"
          }
      }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full` or `reader`. Only present if `reader` is enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|

---
public: true
title: Delete a user
repo: core-account-service
---
# DELETE /io/user/:userId
Delete a user.

_Requires account administrator access._

### Example Request
```shell
curl -X DELETE \
  https://myaccount.leankit.com/io/user/25012' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

204 No Content
---
public: true
title: Get the requesting user
repo: core-account-service
openApi: true
operationId: getCurrentUser
---
# GET /io/user/me
Returns data for the requesting user.

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/user/me' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "id": "25012",
    "username": "user1@mycompany.com",
    "firstName": "User",
    "lastName": "One",
    "fullName": "User One",
    "emailAddress": "user1@mycompany.com",
    "lastAccess": "2018-10-19T19:47:24.890Z",
    "dateFormat": "MM/dd/yyyy",
    "administrator": true,
    "enabled": true,
    "deleted": false,
    "organizationId": "10187654101",
    "boardCreator": true,
    "timeZone": "America/Los_Angeles",
    "licenseType": "full",
    "externalUserName": "user1@mycompany.com",
    "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25",
    "settings": {
        "useMondayForCalendarWeekViewStart": false,
        "avatarBounds": "\"145, 90, 303, 248\"",
        "recentBoards": [
            10100191700,
            10112868410
        ],
        "favoriteBoards": [
            20200292700,
            20222868410
        ]
    },
    "boardRoles": [
        {
            "boardId": "10100000505",
            "WIP": null,
            "role": {
                "key": "boardReader",
                "value": 1,
                "label": "Reader"
            }
        }
    ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full`, `reader`, or `focused`. Only present if `reader` or `focused` users are enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|
---
public: true
title: Get a single user
repo: core-account-service
---
# GET /io/user/:userId
Returns data for a single user.

_Requires account administrator access._

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/user/25012' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "id": "25012",
    "username": "user1@mycompany.com",
    "firstName": "User",
    "lastName": "One",
    "fullName": "User One",
    "emailAddress": "user1@mycompany.com",
    "lastAccess": "2018-10-19T19:47:24.890Z",
    "dateFormat": "MM/dd/yyyy",
    "administrator": true,
    "enabled": true,
    "deleted": false,
    "organizationId": "10187654101",
    "boardCreator": true,
    "timeZone": "America/Los_Angeles",
    "licenseType": "full",
    "externalUserName": "user1@mycompany.com",
    "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25",
    "settings": {
        "useMondayForCalendarWeekViewStart": false,
        "avatarBounds": "\"145, 90, 303, 248\"",
        "recentBoards": [
            10100191700,
            10112868410
        ]
    },
    "boardRoles": [
        {
            "boardId": "10100000505",
            "WIP": null,
            "role": {
                "key": "boardReader",
                "value": 1,
                "label": "Reader"
            }
        }
    ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full`, `reader`, or `focused`. Only present if `reader` or `focused` users are enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|
---
public: false
title: Get info for a list user ids
repo: core-account-service
---
# POST /io/user/info
Returns basic info about a list of users

### Request Properties
|Param|Type|Usage|
|-----|-----|-------|
|`userIds`|string[]|List of userIds to return. Maximum of 100||

### Example Successful Response

200 Success

```json
{
  "users": [
    {
      "id": "25012",
      "firstName": "User",
      "lastName": "One",
      "emailAddress": "user1@mycompany.com",
      "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25"
    }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`firstName`|string||
|`lastName`|string||
|`emailAddress`|string||
|`avatar`|string||
---
public: false
title: Intitiate a password reset
repo: core-auth-service
---

Not documenting this yet as it is part of a very specific flow used by the UI.
---
public: true
title: Get the requesting user's assigned or subscribed cards
repo: core-account-service
---
# GET /io/user/me/card
Returns cards to which that the requesting user is either assigned or subscribed.

### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/user/me/card' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer||0|
|`limit`|integer||200|
|`cardStatus`|string|Only return cards with statuses specified in a csv list. Options are<br />`started`<br />`notStarted`<br />`finished`||
|`type`|enumeration|`assigned`<br />`subscribed`||
|`sort`|enumeration|`title`<br />`priority`<br />`plannedStart`<br />`plannedFinish`||
|`showBlockedFirst`|boolean|||
|`filter`|string|Only return items specified in a csv list. Options are<br />`card`<br />`task`||

### Example Successful Response

200 Success

```json
{
    "pageMeta": {
        "totalRecords": 2,
        "offset": 0,
        "limit": 200,
        "startRow": 1,
        "endRow": 2
    },
    "cards": [
        {
            "id": "818214152",
            "title": "test card one",
            "index": 0,
            "laneId": "814278956",
            "color": "#B8CFDF",
            "tags": [],
            "size": 0,
            "priority": "normal",
            "plannedStart": null,
            "plannedFinish": null,
            "actualStart": "2019-03-29T20:57:11Z",
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2019-03-29T20:57:11.013Z",
            "updatedOn": "2020-01-24T22:20:00.000Z",
            "externalLinks": [],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null,
                "date": null
            },
            "customIcon": {
                "id": "814278952",
                "title": "Regulatory",
                "cardColor": "#FFFFFF",
                "iconColor": "49bbd6",
                "iconName": "lk_icons_final_05-11",
                "iconPath": "https://myaccount.leankit.com/customicons/24/49bbd6/lk_icons_final_05-11.png"
            },
            "customHeader": {
                "value": null,
                "header": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "814278947",
                "name": "New Feature"
            },
            "subscriptionId": "966024831",
            "archivedOn": null,
            "parentCards": [],
            "assignedUsers": [
                {
                    "id": "563201452",
                    "fullName": "User Name",
                    "avatar": "https://myaccount.leankit.com/avatar/show/563201452/?s=25"
                }
            ],
            "connectedCardStats": null,
            "boardId": "814278941"
        },
        {
            "id": "966021242",
            "title": "test card two",
            "index": 0,
            "laneId": "943929934",
            "color": "#F1C7C5",
            "tags": [],
            "size": 0,
            "priority": "normal",
            "plannedStart": null,
            "plannedFinish": null,
            "actualStart": "2020-01-24T22:20:20Z",
            "actualFinish": null,
            "isDone": false,
            "movedOn": "2020-01-24T22:20:20.330Z",
            "updatedOn": "2020-01-24T22:21:11.096Z",
            "externalLinks": [],
            "customIconLabel": "Class of Service",
            "blockedStatus": {
                "isBlocked": false,
                "reason": null,
                "date": null
            },
            "customIcon": null,
            "customHeader": {
                "value": null,
                "header": null,
                "url": null
            },
            "taskBoardStats": null,
            "containingCardId": null,
            "cardType": {
                "id": "943929915",
                "name": "Defect"
            },
            "subscriptionId": "966024841",
            "archivedOn": null,
            "parentCards": [],
            "assignedUsers": [
                {
                    "id": "563201452",
                    "fullName": "User Name",
                    "avatar": "https://myaccount.leankit.com/avatar/show/563201452/?s=25"
                }
            ],
            "connectedCardStats": null,
            "boardId": "943929912"
        }
    ]
}
```
---
public: true
title: Get the requesting user's favorite and most recently accessed boards
repo: core-leankit-api
---
# GET /io/user/me/board/recent
Returns a list of the requesting user's favorite and most recently accessed boards. It will return alphabetically-sorted favorite boards first and then recently accessed boards ordered by access date. The list will have a maximum of 10 results.

### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/user/me/board/recent' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "boards": [
        {
            "id": "10113014456",
            "title": "Board One",
            "description": "Where we do some work!",
            "isWelcome": false,
            "isArchived": false,
            "isFavorite": true,
            "boardRole": "boardAdministrator"
        },
        {
            "id": "10112879419",
            "title": "Board Two",
            "description": null,
            "isWelcome": false,
            "isArchived": false,
            "isFavorite": false,
            "boardRole": "boardAdministrator"
        }
    ]
}
```
---
public: true
title: Get a list of users in an organization
repo: core-account-service
---
# GET /io/user
Returns a paginated list of users in an organization. The list will have a maximum of 1000 results.

_Requires account administrator access._

### Query Params
|Param|Type|Usage|Default|
|-----|-----|------|-------|
|`offset`|integer|Set the "start row" number of the first card to be returned.|0|
|`limit`|integer|Set the number of users to be returned.|100|
|`sortBy`|enumeration|Set the ordering of the results|lastName|
|`search`|string|Keyword search for by user name and email address||

Valid `sortBy` options:
* newUsers
* enabled
* disabled
* firstNameDesc
* firstNameAsc
* licenseTypeAsc
* licenseTypeDesc
* lastName

### Example Request
```shell
curl -X GET \
  https://myaccount.leankit.com/io/user?limit=10&offset=50' \
  -H 'Authorization: Basic base64encodedauth' \
```

### Example Successful Response

200 Success

```json
{
    "pageMeta": {
        "totalRecords": 99,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 25
    },
    "users": [
        {
            "id": "25012",
            "username": "user1@mycompany.com",
            "firstName": "User",
            "lastName": "One",
            "fullName": "User One",
            "emailAddress": "user1@mycompany.com",
            "lastAccess": "2018-10-19T19:47:24.890Z",
            "dateFormat": "MM/dd/yyyy",
            "administrator": true,
            "enabled": true,
            "deleted": false,
            "organizationId": "10187654101",
            "boardCreator": true,
            "timeZone": "America/Los_Angeles",
            "licenseType": "full",
            "externalUserName": "user1@mycompany.com",
            "createdOn": "2015-04-14T20:48:58.283Z",
            "accountOwner": false,
            "avatar": "https://mycompany.leankit.com/avatar/show/25012/?s=25"
        },
        {
            "id": "25013",
            "username": "user2@mycompany.com",
            "firstName": "User",
            "lastName": "Two",
            "fullName": "User Two",
            "emailAddress": "user2@mycompany.com",
            "lastAccess": "2018-10-19T19:47:24.890Z",
            "dateFormat": "MM/dd/yyyy",
            "administrator": true,
            "enabled": true,
            "deleted": false,
            "organizationId": "10187654101",
            "boardCreator": true,
            "timeZone": "America/Los_Angeles",
            "licenseType": "full",
            "externalUserName": "user1@mycompany.com",
            "createdOn": "2015-04-14T20:48:58.283Z",
            "accountOwner": false,
            "avatar": "https://mycompany.leankit.com/avatar/show/25013/?s=25"
        }
    ]
}
```

### User Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full`, `reader`, or `focused`. Only present if `reader` or `focused` users are enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
---
public: false
title: Reset the requesting user's password
repo: core-account-service
---

Not documenting this yet as it is part of a very specific flow used by the UI.
---
public: true
title: Update the requesting user
repo: core-account-service
---
# PATCH /io/user/me
Update the requesting user.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`firstName`|string|||
|`lastName`|string|||
|`timeZone`|string|See [valid timezones](/markdown/01-overview/time-zones.md).|Etc/GMT|
|`dateFormat`|enumeration|`MM/dd/yyyy`, `dd/MM/yyyy`, or `yyyy/MM/dd`||
|`locale`|enumeration|||
|`useMondayForStartOfWeek`|boolean|||

Supported locales:
* `en-US`
* `en-GB`
* `en-CA`
* `fr-FR`
* `fr-CA`

### Example Request
```json
{
  "firstName": "SomeOne",
  "lastName": "Else",
  "timeZone": "America/New_York",
  "locale": "en-US",
  "useMondayForStartOfWeek": true
}
```

### Example Successful Response

200 Success
```json
{
  "id": "10113041625",
  "username": "someone@mycompany.com",
  "firstName": "SomeOne",
  "lastName": "Else",
  "fullName": "SomeOne Else",
  "emailAddress": "someone@mycompany.com",
  "lastAccess": null,
  "dateFormat": "MM/dd/yyyy",
  "administrator": false,
  "enabled": true,
  "deleted": false,
  "organizationId": "10187654101",
  "boardCreator": false,
  "timeZone": "America/New_York",
  "licenseType": "full",
  "externalUserName": null,
  "avatar": "https://bigfood.localkanban.com/avatar/show/10113041625/?s=25",
  "settings": {
    "locale": "en-US",
    "useMondayForCalendarWeekViewStart": true
  },
  "boardRoles": [
      {
          "boardId": "10100000505",
          "WIP": null,
          "role": {
              "key": "boardReader",
              "value": 1,
              "label": "Reader"
          }
      }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full`, `reader`, or `focused`. Only present if `reader` or `focused` users are enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|


---
public: false
title: Update the requesting user's settings
repo: core-account-service
---
# POST /io/user/setting
Update the settings of the requesting user.

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`name`*|`string`|||
|`value`*|varies|||

This endpoint is different from most of our other endpoints because it has multiple uses and, therefore, different schemas. The `name` of the setting determines the shape of the `value`.

Acceptable `name` values:

* `CollapsedLanes`
* `RecentBoards`
* `FirstAccess`
* `showSimulationTutorial`
* `UseMondayForCalendarWeekViewStart`
* `AvatarBounds`
* `NonPaymentDialogShownForDate`
* `DialogShownForRange`
* `SavedFilters`
* `ParentPanel`
* `FavoriteBoards`

### `CollapsedLanes`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`boardId`*|`integer`|||
|`value`*|array|A list of laneIds||

#### Example Request
```json
{
  "name": "CollapsedLanes",
  "boardId": "20022002",
  "value": ["11100111", "11100112"]
}
```

### `RecentBoards`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|integer|A board id to add to the recent boards list||

#### Example Request
```json
{
  "name": "RecentBoards",
  "value": "20022002"
}
```

### `FirstAccess`, `showSimulationTutorial`, `UseMondayForCalendarWeekViewStart`,

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|boolean|||

#### Example Request
```json
{
  "name": "showSimulationTutorial",
  "value": true
}
```

### `AvatarBounds`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|array|List of integers describing avatar bounds||

#### Example Request
```json
{
  "name": "AvatarBounds",
  "value": [100, 200, 300, 400]
}
```

### `NonPaymentDialogShownForDate`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|datetime|||

#### Example Request
```json
{
  "name": "NonPaymentDialogShownForDate",
  "value": "2019-06-19T08:30:06.283185Z"
}
```

### `DialogShownForRange`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|string|Options:<br />`First`<br />`Second`<br />`Third`<br />`Forth`<br />`Fifth`||

#### Example Request
```json
{
  "name": "DialogShownForRange",
  "value": "First"
}
```

### `SavedFilters`

|Param|Type|Usage|Default|
|-----|-----|-------|---|
|`boardId`*|integer|||
|`value.selectedFilterId`|integer|id of the selected filter||
|`value.mode`*|string|`off`, `highlight` or `showOnly`||
|`value.cardTypes`|string array|List of card type ids||
|`value.classOfServices`|string array|List of classes of service ids, `-1` can be used for `Not Assigned`|||
|`value.priorities`|integer array|List of priority values<br />`0` (Normal) <br /> `1` (Low) <br /> `2` (High) <br /> `3` (Critical)||
|`value.blocks`|integer array|`1` indicates blocked cards, `0` is cards that are not blocked||
|`value.parentCards`|string array|List of parent card ids, `-1` can be used for `Not Assigned`|||
|`value.parentCardView`|enumeration|Controls parent card filter display, not currently used||
|`value.users`|string array|List of assigned user ids||
|`value.startDate`|integer|Planned start date is before this number of days from now||
|`value.finishDate`|integer|Planned finish date is before this number of days from now||
|`value.title`|string|Title or custom id match||
|`value.tags`|string array|List of tags||
|`value.plannedStartRange.start`|date|Planned start date is on or after this date||
|`value.plannedStartRange.end`|date|Planned start date is on or before this date||
|`value.plannedFinishRange.start`|date|Planned finish date is on or after this date||
|`value.plannedFinishRange.end`|date|Planned finish date is on or before this date||
|`value.FilterTagByOr`|boolean|Should the tags filter use AND or OR||
|`value.FilterStaleness`|boolean|Should the filter include stale cards||
|`value.FilterStalenessDays`|integer|Number of days to consider a card as "stale"||
|`value.activity.mode`|enumeration|Possible values are <br />`noActivity` <br />`withActivity` <br /> `notMoved` <br />`haveMoved`||
|`value.activity.days`|integer|Number of days applied to the activity mode||
|`value.customFields.id`|string|Id of the custom field being filtered||
|`value.customFields.type`|enumeration|Possible values are <br />`text` <br />`number` <br />`date` <br />`choice` <br />`multi`||
|`value.customFields.filterMethod`|string|Describes the method with which the filter will be applied||
|`value.customFields.value`|string or string array|The value or list of values for the filter||
|`value.cardScoring.min`|integer|Minimum card scoring range value||
|`value.cardScoring.max`|integer|Maximum card scoring range value||

#### Example Request
```json
{
  "name": "SavedFilters",
  "boardId": "20022002",
  "value": {
    "mode": "highlight",
    "title": "some title"
  }
}
```

### `ParentPanel`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`boardId`*|`integer`|||
|`value.panelOpen`|boolean|Should the parent panel be open or closed||
|`value.mode`|string|`both`, `cards` or `boards`||
|`value.connectionsVisible`|boolean|Should the connection yarn be shown||

#### Example Request
```json
{
  "name": "ParentPanel",
  "boardId": "20022002",
  "value": {
    "panelOpen": true,
    "mode": "cards",
    "connectionsVisible": true
  }
}
```

### `FavoriteBoards`

|Param|Type|Usage|Default|
|-----|-----|-----|-------|
|`value`*|array|A list of boardIds||

#### Example Request
```json
{
  "name": "FavoriteBoards",
  "value": [ "10011001", "20022002" ]
}
```
---
public: true
title: Update a user
repo: core-account-service
---
# PATCH /io/user/:userId
Update an existing user.

_Requires account administrator access._

### Request Properties
|Param|Type|Usage|Default|
|-----|-----|-------|-------|
|`emailAddress`|string|||
|`firstName`|string|||
|`lastName`|string|||
|`timeZone`|string|See [valid timezones](/markdown/01-overview/time-zones.md).|Etc/GMT|
|`enabled`|boolean||`true`|
|`administrator`|boolean||`false`|
|`boardCreator`|boolean||`false`|
|`dateFormat`|enumeration|Values: <br />`MM/dd/yyyy`<br />`dd/MM/yyyy`<br />`yyyy/MM/dd`|`MM/dd/yyyy`|
|`licenseType`|enumeration|Only available if `reader` users are enabled for the account. Possible values:<br />`full`<br />`reader`|`full`|
|`externalUserName`|string|||

### Example Request
```json
{
  "firstName": "SomeOne",
  "lastName": "Else",
  "timeZone": "America/New_York",
  "enabled": "false",
  "administrator": true,
  "boardCreator": true,
  "dateFormat": "MM/dd/yyyy",
  "licenseType": "full"
}
```

### Example Successful Response

200 Success
```json
{
  "id": "10113041625",
  "username": "someone@mycompany.com",
  "firstName": "SomeOne",
  "lastName": "Else",
  "fullName": "SomeOne Else",
  "emailAddress": "someone@mycompany.com",
  "lastAccess": null,
  "dateFormat": "MM/dd/yyyy",
  "administrator": true,
  "enabled": false,
  "deleted": false,
  "organizationId": "10187654101",
  "boardCreator": true,
  "timeZone": "America/New_York",
  "licenseType": "full",
  "externalUserName": null,
  "avatar": "https://bigfood.localkanban.com/avatar/show/10113041625/?s=25",
  "settings": {},
  "boardRoles": [
      {
          "boardId": "10100000505",
          "WIP": null,
          "role": {
              "key": "boardReader",
              "value": 1,
              "label": "Reader"
          }
      }
  ]
}
```

### Response Properties
|Property|Type|Note|
|--------|----|----|
|`id`|string id||
|`username`|string||
|`firstName`|string||
|`lastName`|string||
|`fullName`|string||
|`emailAddress`|string||
|`lastAccess`|date||
|`dateFormat`|string||
|`administrator`|boolean||
|`enabled`|boolean||
|`deleted`|boolean||
|`organizationId`|string||
|`boardCreator`|boolean||
|`timeZone`|string||
|`licenseType`|string|`full` or `reader`. Only present if `reader` is enabled for the account|
|`externalUserName`|string||
|`avatar`|string||
|`settings`|object|Contains a key/value hash of user settings|
|`boardRoles`|array|Contains the user's access information for the organization's boards|


---
title: List your open invitations to new users
public: true
repo: core-account-service
---
# GET /io/invitation
List your open invitations to new users.

### Query Params
|Param|Type|Usage|Default|
|---|---|---|---|
|`offset`|integer|Set the "start row" number of the first item to be returned.|0|
|`limit`|integer|Set the number of items to be returned.|25|
|`status`|enumeration|Possible values <br />`pending`<br />`accepted`|pending|

### Example Request
```
curl -X GET \
  https://myaccount.leankit.com/io/invitation \
  -H 'Authorization: Basic base64encodedauthhere='
```

### Example Response
```json
{
    "pageMeta": {
        "totalRecords": 1,
        "offset": 0,
        "limit": 25,
        "startRow": 1,
        "endRow": 1
    },
    "invitations": [
        {
            "id": "10113992540",
            "emailAddress": "bob@thatco.com",
            "emailSendStatus": "success",
            "emailDateSent": "2020-01-14T23:28:11.000Z",
            "creationDate": "2020-01-14T23:28:10.000Z",
            "acceptDate": null,
            "isExpired": false,
            "isRevoked": false,
            "invitingUser": {
                "id": "25019",
                "firstName": "Jim",
                "lastName": "Martinsen",
                "fullName": "Jim Martinsen",
                "enabled": true,
                "isDeleted": false,
                "emailAddress": "jim@myco.com"
            },
            "invitedUser": null
        }
    ]
}
```
---
title: Revoke an open user invitation
public: true
repo: core-account-service
---
# PATCH /io/invitation/:invitationId
Revoke an open user invitation. (You can also un-revoke if you like.)
### Example Request Body
```json
{
    "isRevoked": true
}
```
### Successful Response
204 No Content
