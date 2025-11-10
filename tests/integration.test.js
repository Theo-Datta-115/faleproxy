const cheerio = require('cheerio');
// ❌ remove child_process + exec, we won't spawn or sed-edit anything
// const { exec } = require('child_process');
// const { promisify } = require('util');
// const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// ✅ keep real axios.post to call the local server
const axios = require('axios');
// ✅ import the app and run it in-process
const app = require('../app');

let server;
let TEST_PORT;
let getSpy;

afterEach(() => {
  // restore any axios.get spy set in tests
  if (getSpy) {
    getSpy.mockRestore();
    getSpy = null;
  }
  jest.clearAllMocks();
});

describe('Integration Tests', () => {
  beforeAll((done) => {
    // Block all external connections except to our local server
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    // Start the server on an ephemeral port
    server = app.listen(0, () => {
      TEST_PORT = server.address().port;
      done();
    });
  }, 10000);

  afterAll((done) => {
    if (server) {
      server.close(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        done();
      });
    } else {
      nock.cleanAll();
      nock.enableNetConnect();
      done();
    }
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock the outbound fetch that app.js does
    getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: sampleHtmlWithYale
    });

    // Call our local server
    const response = await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
      url: 'https://example.com/'
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs should be unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);

    // Link text should be changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000);

  test('Should handle invalid URLs', async () => {
    // Make the outbound axios.get fail
    getSpy = jest.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('boom'), { code: 'ECONNREFUSED' })
    );

    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {
        url: 'not-a-valid-url'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(500);
      expect(String(error.response.data.error)).toMatch(/Failed to fetch content/i);
    }
  });

  test('Should handle missing URL parameter', async () => {
    // No outbound call happens here, so no spy needed
    try {
      await axios.post(`http://localhost:${TEST_PORT}/fetch`, {});
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
