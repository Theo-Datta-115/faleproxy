const cheerio = require('cheerio');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const axios = require('axios');
const app = require('../app'); // run the real app in-process

let server;
let TEST_PORT;

// quiet error logs during tests (optional)
jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  console.error.mockRestore();
});

describe('Integration Tests', () => {
  beforeAll((done) => {
    // Block real internet; allow local loopback (localhost, 127.0.0.1, ::1)
    nock.disableNetConnect();
    nock.enableNetConnect(/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/);

    // Start app on an ephemeral port
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
    // Mock the outbound request your app makes
    nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale);

    // Make a request to our app
    const response = await axios.post(
      `http://127.0.0.1:${TEST_PORT}/fetch`,
      { url: 'https://example.com/' },
      { proxy: false }
    );

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.data.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) hasYaleUrl = true;
    });
    expect(hasYaleUrl).toBe(true);

    // Link text changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000);

  test('Should handle invalid URLs', async () => {
    try {
      await axios.post(
        `http://127.0.0.1:${TEST_PORT}/fetch`,
        { url: 'not-a-valid-url' },
        { proxy: false }
      );
      expect(true).toBe(false); // should not reach
    } catch (error) {
      // axios throws; app should return 500
      expect(error.response && error.response.status).toBe(500);
    }
  });

  test('Should handle missing URL parameter', async () => {
    try {
      await axios.post(
        `http://127.0.0.1:${TEST_PORT}/fetch`,
        {},
        { proxy: false }
      );
      expect(true).toBe(false); // should not reach
    } catch (error) {
      expect(error.response && error.response.status).toBe(400);
      expect(error.response.data.error).toBe('URL is required');
    }
  });
});
