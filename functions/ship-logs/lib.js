'use strict';

const _ = require('lodash');
const co = require('co');
const Promise = require('bluebird');
const net = require('net');
const parse = require('./parse');
const cloudwatch = require('./cloudwatch');

const host = process.env.logstash_host;
const port = process.env.logstash_port;
const { token } = process.env;

const sendLogs = co.wrap(function* (logs) {
  yield new Promise((resolve, reject) => {
    const socket = net.connect(port, host, () => {
      socket.setEncoding('utf8');

      for (const log of logs) {
        try {
          log.token = token;
          socket.write(`${JSON.stringify(log)  }\n`);
        } catch (err) {
          console.error(err.message);
        }
      }

      socket.end();

      resolve();
    });
  });
});

const publishMetrics = co.wrap(function* (metrics) {
  const metricDatumByNamespace = _.groupBy(metrics, m => m.Namespace);
  const namespaces = _.keys(metricDatumByNamespace);
  for (const namespace of namespaces) {
    const datum = metricDatumByNamespace[namespace];

    try {
      yield cloudwatch.publish(datum, namespace);
    } catch (err) {
      console.error('failed to publish metrics', err.message);
      console.error(JSON.stringify(datum));
    }
  }
});

const processAll = co.wrap(function* (logGroup, logStream, logEvents) {
  const result = parse.all(logGroup, logStream, logEvents);

  if (result.logs && result.logs.length > 0) {
    yield sendLogs(result.logs);
  }

  if (result.customMetrics && result.customMetrics.length > 0) {
    yield publishMetrics(result.customMetrics);
  }

  if (result.usageMetrics && result.usageMetrics.length > 0) {
    yield publishMetrics(result.usageMetrics);
  }
});

module.exports = processAll;
