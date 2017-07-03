'use strict';

const Promise = require('promise');
const translatorService = require('../../clients/translator/MsftTranslator');
const cassandraConnector = require('../../clients/cassandra/CassandraConnector');
const featureServiceClient = require('../../clients/locations/FeatureServiceClient');
const withRunTime = require('../shared').withRunTime;

function cassandraRowToFeature(row) {
  return {
    type: row.pipeline,
    coordinates: [],
    properties: {
      edges: row.detectedkeywords,
      messageid: row.externalid,
      createdtime: row.event_time,
      sentiment: row.computedfeatures && row.computedfeatures.sentiment &&
        row.computedfeatures.sentiment.pos_avg > row.computedfeatures.sentiment.neg_avg
        ? row.computedfeatures.sentiment.pos_avg - row.computedfeatures.sentiment.neg_avg + 0.6
        : row.computedfeatures.sentiment.neg_avg - row.computedfeatures.sentence.pos_avg,
      title: row.title,
      originalSources: row.pipeline &&
        [row.pipeline],
      language: row.eventlangcode,
      source: row.sourceurl,
      fullText: row.messagebody
    }
  };
}

/**
 * @typedef {type: string, coordinates: number[][], properties: {edges: string[], messageid: string, createdtime: string, sentiment: number, title: string, originalSources: string[], sentence: string, language: string, source: string, properties: {retweetCount: number, fatalaties: number, userConnecionCount: number, actor1: string, actor2: string, actor1Type: string, actor2Type: string, incidentType: string, allyActor1: string, allyActor2: string, title: string, link: string, originalSources: string[]}, fullText: string}} Feature
 */

/**
 * @param {site: string, originalSource: string, coordinates: number[], mainTerm: string, filteredEdges: string[], langCode: string, limit: number, offset: number, fromDate: string, toDate: string, sourceFilter: string[], fulltextTerm: string} args
 * @returns {Promise.<{runTime: string, type: string, bbox: number[], features: Feature[]}>}
 */
function byLocation(args, res) { // eslint-disable-line no-unused-vars
}

/**
 * @param {site: string, originalSource: string, bbox: number[], mainTerm: string, filteredEdges: string[], langCode: string, limit: number, offset: number, fromDate: string, toDate: string, sourceFilter: string[], fulltextTerm: string} args
 * @returns {Promise.<{runTime: string, type: string, bbox: number[], features: Feature[]}>}
 */
function byBbox(args, res) { // eslint-disable-line no-unused-vars
}

/**
 * @param {site: string, originalSource: string, filteredEdges: string[], langCode: string, limit: number, offset: number, fromDate: string, toDate: string, sourceFilter: string[], fulltextTerm: string} args
 * @returns {Promise.<{runTime: string, type: string, bbox: number[], features: Feature[]}>}
 */
function byEdges(args, res) { // eslint-disable-line no-unused-vars
}

/**
 * @param {{site: string, messageId: string, dataSources: string[], langCode: string}} args
 * @returns {Promise.<Feature>}
 */
function event(args, res) { // eslint-disable-line no-unused-vars
  const makeEventQuery = () => {
    const query = 'SELECT * FROM fortis.events WHERE id = ?';
    const params = [args.messageId];
    return {query: query, params: params};
  };

  return new Promise((resolve, reject) => {
    const eventId = args && args.messageId;
    if (!eventId) {
      return reject('No event id to fetch specified');
    }

    const query = makeEventQuery();
    cassandraConnector.executeQuery(query.query, query.params)
    .then(rows => {
      if (rows.length > 1) {
        return reject(`Got more ${rows.length} events with id ${eventId}`);
      }

      const row = rows[0];
      const feature = cassandraRowToFeature(row);
      featureServiceClient.fetchById(row.detectedplaceids || [])
      .then(places => {
        feature.coordinates = places.map(place => place.bbox);
        resolve(feature);
      })
      .catch(reject);
    })
    .catch(reject);
  });
}

/**
 * @param {{sentence: string, fromLanguage: string, toLanguage: string}} args
 * @returns {Promise.<{originalSentence: string, translatedSentence: string}>}
 */
function translate(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    translatorService.translate(args.sentence, args.fromLanguage, args.toLanguage)
      .then(result => resolve({ translatedSentence: result.translatedSentence, originalSentence: args.sentence }))
      .catch(reject);
  });
}

/**
 * @param {{words: string[], fromLanguage: string, toLanguage: string}} args
 * @returns {Promise.<{words: Array<{originalSentence: string, translatedSentence: string}>}>}
 */
function translateWords(args, res) { // eslint-disable-line no-unused-vars
  return new Promise((resolve, reject) => {
    translatorService.translateSentenceArray(args.words, args.fromLanguage, args.toLanguage)
      .then(result => resolve({ words: result.translatedSentence }))
      .catch(reject);
  });
}

module.exports = {
  byLocation: withRunTime(byLocation),
  byBbox: withRunTime(byBbox),
  byEdges: withRunTime(byEdges),
  event: event,
  translate: translate,
  translateWords: translateWords
};
