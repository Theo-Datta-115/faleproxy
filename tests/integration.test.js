const cheerio = require('cheerio');
const request = require('supertest');
const app = require('../app');
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// optional: quiet error logs during tests
jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  console.error.mockRestore();
});

describe('Integration Tests', () => {
  beforeAll(() => {
    // Block real internet; we’ll mock example.com below.
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Mock the outbound request your app makes
    nock('https://example.com').get('/').reply(200, sampleHtmlWithYale);

    const res = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .expect(200);

    expect(res.body.success).toBe(true);

    const $ = cheerio.load(res.body.content);
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

    // Link text is changed
    expect($('a').first().text()).toBe('About Fale');
  }, 10000);

  test('Should handle invalid URLs', async () => {
    const res = await request(app)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' });

    expect(res.status).toBe(500);
    expect(String(res.body.error)).toMatch(/Failed to fetch content/i);
  });

  test('Should handle missing URL parameter', async () => {
    const res = await request(app)
      .post('/fetch')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('URL is required');
  });
});
