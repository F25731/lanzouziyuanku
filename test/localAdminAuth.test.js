const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLocalAdminAuth,
  localAdminCors
} = require('../middleware/localAdminAuth');

function makeReq(headers = {}, method = 'GET') {
  return {
    method,
    headers,
    get(name) {
      return headers[String(name).toLowerCase()];
    }
  };
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      this.ended = true;
      return this;
    },
    sendStatus(code) {
      this.statusCode = code;
      this.ended = true;
      return this;
    }
  };
}

test('local admin auth rejects missing token', () => {
  const middleware = createLocalAdminAuth({ token: 'secret-token' });
  const req = makeReq();
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, 'Invalid local admin token');
});

test('local admin auth accepts matching X-Admin-Token', () => {
  const middleware = createLocalAdminAuth({ token: 'secret-token' });
  const req = makeReq({ 'x-admin-token': 'secret-token' });
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.ended, false);
});

test('local admin cors handles browser preflight for local html', () => {
  const req = makeReq({}, 'OPTIONS');
  const res = makeRes();
  let nextCalled = false;

  localAdminCors(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.match(res.headers['Access-Control-Allow-Headers'], /X-Admin-Token/);
});
