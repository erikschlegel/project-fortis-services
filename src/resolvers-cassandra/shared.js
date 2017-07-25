'use strict';

const Promise = require('promise');

function withRunTime(promiseFunc) {
  function runTimer() {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      promiseFunc.apply(this, arguments)
      .then(returnValue => {
        const endTime = Date.now();
        returnValue.runTime = endTime - startTime;
        resolve(returnValue);
      })
      .catch(reject);
    });
  }

  return runTimer;
}

const allSources = [
  'bing',
  'customevents',
  'tadaweb',
  'facebook',
  'twitter',
  'radio',
  'reddit',
  'instagram'
];

function toPipelineKey(sourceFilter) {
  if (!sourceFilter || !sourceFilter.length) {
    return 'all';
  }

  if (sourceFilter.length > 1) {
    console.warn(`Only one source filter supported, ignoring: ${sourceFilter.slice(1).join(', ')}`);
  }

  return sourceFilter[0];
}

function toConjunctionTopics(mainEdge, filteredEdges) {
  if (!filteredEdges || !filteredEdges.length) {
    return [mainEdge, null, null];
  }

  const extraFilters = filteredEdges.slice(0, 2);
  if (filteredEdges.length > 2) {
    console.warn(`Only two filtered edges supported, ignoring: ${filteredEdges.slice(2).join(', ')}`);
  }

  const selectedFilters = [mainEdge].concat(extraFilters).sort();
  while (selectedFilters.length < 3) {
    selectedFilters.push(null);
  }

  return selectedFilters;
}

function parseFromToDate(fromDate, toDate) {
  // TODO: implement
  return {
    period: '',
    periodType: '',
    fromDate,
    toDate
  };
}

module.exports = {
  parseFromToDate,
  toPipelineKey,
  toConjunctionTopics,
  allSources: allSources,
  withRunTime: withRunTime
};
