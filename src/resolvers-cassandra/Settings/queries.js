'use strict';

const Promise = require('promise');
const facebookAnalyticsClient = require('../../clients/facebook/FacebookAnalyticsClient');
const cassandraConnector = require('../../clients/cassandra/CassandraConnector');
const { withRunTime, getSiteDefintion } = require('../shared');
const trackEvent = require('../../clients/appinsights/AppInsightsClient').trackEvent;

const PIPELINE_KEY_TWITTER = 'twitter';
const CONNECTOR_FACEBOOK = 'Facebook';

function transformWatchlist(item, translatedlanguage) {
  return {
    topicid: item.topicid,
    name: item.topic,
    translatedname: item.lang_code !== (translatedlanguage || item.lang_code) ?
      (item.translations || {})[translatedlanguage] : item.topic,
    translatednamelang: translatedlanguage,
    namelang: item.lang_code
  };
}

function terms(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const translationLanguage = args.translationLanguage;

    const query = `
    SELECT topicid, topic, translations, lang_code
    FROM fortis.watchlist
    `.trim();

    const params = [];
    cassandraConnector.executeQuery(query, params)
      .then(rows =>
        resolve({
          edges: rows
            .map(item => transformWatchlist(item, translationLanguage))
            .filter(term => term.translatedname)
        })
      ).catch(reject);
  });
}

function sites(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    getSiteDefintion()
      .then(resolve)
      .catch(reject);
  });
}

function streams(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    cassandraConnector.executeQuery('SELECT * FROM fortis.streams', [])
      .then(rows => {
        const streams = rows.map(cassandraRowToStream);
        resolve({
          streams
        });
      })
      .catch(reject);
  });
}

function trustedsources(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM fortis.trustedsources where pipelinekey IN ?';
    const params = [
      args.pipelinekeys,
    ];

    cassandraConnector.executeQuery(query, params)
      .then(rows => resolve({
        sources: rows.map(cassandraRowToSource)
          .filter(source => trustedSourceFilter(source, args.sourcename))
      }))
      .catch(reject);
  });
}

function cassandraRowToStream(row) {
  if (row.enabled == null) row.enabled = false;
  return {
    streamId: row.streamid,
    pipelineKey: row.pipelinekey,
    pipelineLabel: row.pipelinelabel,
    pipelineIcon: row.pipelineicon,
    streamFactory: row.streamfactory,
    params: paramsToParamsEntries(row.params),
    enabled: row.enabled
  };
}

function cassandraRowToSource(row) {
  return {
    externalsourceid: row.externalsourceid,
    sourcetype: row.sourcetype,
    pipelinekey: row.pipelinekey,
    rank: row.rank
  };
}

function trustedSourceFilter(row, namequery) {
  if (namequery) {
    return row.externalsourceid.toLowerCase().indexOf(namequery.toLowerCase()) > -1;
  }

  return true;
}

function paramsToParamsEntries(params) {
  const paramsEntries = [];
  for (const key of Object.keys(params)) {
    let value = params[key];
    let paramsEntry = {
      key,
      value
    };
    paramsEntries.push(paramsEntry);
  }
  return paramsEntries;
}

function cassandraRowToTwitterAccount(row) {
  return {
    userIds: row.params.userIds,
    consumerKey: row.params.consumerKey,
    consumerSecret: row.params.consumerSecret,
    accessToken: row.params.accessToken,
    accessTokenSecret: row.params.accessTokenSecret
  };
}

function twitterAccounts(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const sourcesByPipelineKey = 'SELECT params FROM fortis.streams WHERE pipelinekey = ?';
    cassandraConnector.executeQuery(sourcesByPipelineKey, [PIPELINE_KEY_TWITTER])
      .then(result => {
        const accounts = result.map(cassandraRowToTwitterAccount);
        resolve({ accounts: accounts });
      })
      .catch(reject)
      ;
  });
}

function cassandraRowToTrustedTwitterAccount(row) {
  return {
    RowKey: `${row.connector},${row.sourceid},${row.sourcetype}`,
    acctUrl: row.sourceid
  };
}

function trustedTwitterAccounts(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const sourcesByConnector = 'SELECT connector, sourceid, sourcetype  FROM fortis.trustedsources WHERE pipelinekey = ? ALLOW FILTERING';
    cassandraConnector.executeQuery(sourcesByConnector, [PIPELINE_KEY_TWITTER])
      .then(rows => {
        const accounts = rows.map(cassandraRowToTrustedTwitterAccount);
        resolve({ accounts: accounts });
      })
      .catch(reject)
      ;
  });
}

function cassandraRowToFacebookPage(row) {
  return {
    RowKey: `${row.connector},${row.sourceid},${row.sourcetype}`,
    pageUrl: row.sourceid
  };
}

function facebookPages(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const sourcesByConnector = 'SELECT connector, sourceid, sourcetype FROM fortis.trustedsources WHERE connector = ? ALLOW FILTERING';
    cassandraConnector.executeQuery(sourcesByConnector, [CONNECTOR_FACEBOOK])
      .then(rows => {
        const pages = rows.map(cassandraRowToFacebookPage);
        resolve({ pages: pages });
      })
      .catch(reject)
      ;
  });
}

function facebookPageToId(page) {
  const match = page && page.pageUrl && page.pageUrl.match(/facebook.com\/([^/]+)/);
  return match && match.length >= 1 && match[1];
}

function facebookAnalytics(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    facebookPages({ siteId: args.siteId })
      .then(response => {
        const pageIds = response.pages.map(facebookPageToId).filter(pageId => !!pageId);
        Promise.all(pageIds.map(pageId => ({ Name: pageId, LastUpdated: facebookAnalyticsClient.fetchPageLastUpdatedAt(pageId), Count: -1 })))
          .then(analytics => resolve({ analytics }))
          .catch(reject);
      });
  });
}

function cassandraRowToTermFilter(row) {
  return {
    id: row.id,
    filteredTerms: row.conjunctivefilter
  };
}

function termBlacklist(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    const blacklistQuery = 'SELECT id, conjunctivefilter FROM fortis.blacklist';
    cassandraConnector.executeQuery(blacklistQuery, [])
    .then(rows => {
      const filters = rows.map(cassandraRowToTermFilter);
      resolve({ filters });
    })
    .catch(reject);
  });
}

module.exports = {
  sites: trackEvent(withRunTime(sites), 'sites'),
  streams: trackEvent(withRunTime(streams), 'streams'),
  siteTerms: trackEvent(withRunTime(terms), 'terms'),
  trustedsources: trackEvent(withRunTime(trustedsources), 'trustedsources'),
  twitterAccounts: trackEvent(withRunTime(twitterAccounts), 'twitterAccounts'),
  trustedTwitterAccounts: trackEvent(withRunTime(trustedTwitterAccounts), 'trustedTwitterAccounts'),
  facebookPages: trackEvent(withRunTime(facebookPages), 'facebookPages'),
  facebookAnalytics: trackEvent(facebookAnalytics, 'facebookAnalytics'),
  termBlacklist: trackEvent(withRunTime(termBlacklist), 'termBlacklist')
};