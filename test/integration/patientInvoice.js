/* eslint no-unused-expressions:"off" */
/* global expect, agent */

const uuid = require('uuid/v4');
const helpers = require('./helpers');

const genuuid = () => uuid().toUpperCase().replace(/-/g, '');

/**
 * @todo passing the date as an object causes the invoice request object to
 * be sent in a different order, breaking the staging/ writing process - this
 * should be fixed and verified with tests
 */

/* The /invoices API endpoint */
describe('(/invoices) Patient Invoices', () => {
  const numInvoices = 4;
  const numCreatedInvoices = 3;
  const numDeletedInvoices = 1;

  const fetchableInvoiceUuid = '957e4e79-a6bb-4b4d-a8f7-c42152b2c2f6';

  // run the 'InvoicingFeeScenario' test suite
  describe('(POST /invoices)', InvoicingFeeScenario);

  it('GET /invoices returns a list of patient invoices', () => {
    return agent.get('/invoices')
      .then(res => {
        helpers.api.listed(res, numInvoices);
      })
      .catch(helpers.handler);
  });

  it('GET /invoices/:uuid returns a valid patient invoice', () => {
    return agent.get(`/invoices/${fetchableInvoiceUuid}`)
      .then(res => {
        expect(res).to.have.status(200);
        expect(res).to.be.json;

        const invoice = res.body;

        expect(invoice).to.not.be.empty;
        expect(invoice).to.contain.keys('uuid', 'cost', 'date', 'items');
        expect(invoice.items).to.not.be.empty;
        expect(invoice.items[0]).to.contain.keys('uuid', 'code', 'quantity');
      })
      .catch(helpers.handler);
  });

  it('GET /invoices/:uuid returns 404 for an invalid patient invoice', () => {
    return agent.get('/invoices/unknown')
      .then(res => {
        helpers.api.errored(res, 404);
      })
      .catch(helpers.handler);
  });

  describe('(/invoices) Search interface for the invoices table', () => {

    // no parameters provided
    it('GET /invoices/ should return all invoices if no query string provided', () => {
      return agent.get('/invoices')
        .then(res => {
          helpers.api.listed(res, (numInvoices + numCreatedInvoices) - numDeletedInvoices);
        })
        .catch(helpers.handler);
    });

    it('GET /invoices?debtor_uuid=3BE232F9A4B94AF6984C5D3F87D5C107 should return six invoices', () => {
      return agent.get('/invoices?debtor_uuid=3BE232F9A4B94AF6984C5D3F87D5C107')
        .then(res => {
          helpers.api.listed(res, 6);
        })
        .catch(helpers.handler);
    });

    // valid filter, but no results expected
    it('GET /invoices?cost=0 should return no invoices', () => {
      return agent.get('/invoices?cost=0')
        .then(res => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.have.length(0);
        })
        .catch(helpers.handler);
    });

    // filter should find exactly one result
    it('GET /invoices?cost=75 should return a single invoice', () => {
      return agent.get('/invoices?cost=75')
        .then(res => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.have.length(1);
        })
        .catch(helpers.handler);
    });

    it('GET /invoices?cost=75&project_id=1 should return a single invoice (combined filter)', () => {
      return agent.get('/invoices?cost=75&project_id=1')
        .then(res => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.have.length(1);
        })
        .catch(helpers.handler);
    });

    it('GET /invoices?cost=15&project_id=1 should not return any results', () => {
      return agent.get('/invoices?cost=15&project_id=1')
        .then(res => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.have.length(0);
        })
        .catch(helpers.handler);
    });
  });
});

/*
 * Patient Invoicing Scenarios
 *
 * This test suite goes through a litany of testing scenarios to ensure the
 * API is bullet-proof.
 */
function InvoicingFeeScenario() {
  /*
   * A simple invoice that should be posted without issue.  This demonstrates
   * that the POST /invoices route works as intended for the simple invoicing of
   * patients.  Demonstrates:
   *  1) @todo the "debit" field is not required in invoice_items and should be
   *    removed in the future
   *  2) Uuids are not required and will be generated by the server.
   *  3) The 'cost' field is not required and will be (correctly) calculated by
   *    the server
   *  4) Changing the 'inventory_price' does not have side-effects - it is only
   *    the 'transaction_price' that has any bearing.
   *  5) The 'user_id' should be ignored, and default to the logged in user.
   */

  const SIMPLE_UUID = genuuid();
  const simpleInvoice = {
    date : new Date(),
    cost : 35.14, // this cost should be calculated by the server (see test).
    description : 'A Simple Invoice of two items costing $35.14',
    service_id : helpers.data.ADMIN_SERVICE,
    debtor_uuid : '3BE232F9A4B94AF6984C5D3F87D5C107',
    project_id : helpers.data.PROJECT,
    user_id  : helpers.data.OTHERUSER,
    uuid : SIMPLE_UUID,

    /* @todo - change this API to not need credit/debit fields */
    items  : [{
      inventory_uuid : helpers.data.QUININE,
      quantity : 1,
      inventory_price : 8,
      transaction_price : 10.14,
      credit : 10.14,
    }, {
      inventory_uuid : helpers.data.PARACETEMOL,
      quantity : 1,
      inventory_price : 25,
      transaction_price : 25,
      credit : 25,
    }],
  };

  it('creates and posts a patient invoice (simple)', () => {
    return agent.post('/invoices')
      .send({ invoice : simpleInvoice })
      .then(res => {
        helpers.api.created(res);

        // make sure we can locate the invoice in the database
        return agent.get('/invoices/'.concat(res.body.uuid));
      })
      .then(res => {
        expect(res).to.have.status(200);
        expect(res).to.be.json;

        // ensure the data in the database is correct
        const invoice = res.body;
        expect(invoice.cost).to.equal(simpleInvoice.cost);
        expect(invoice.items).to.have.length(simpleInvoice.items.length);

        // NOTE - this is not what was sent, but the server has corrected it.
        expect(invoice.user_id).to.equal(helpers.data.SUPERUSER);
      })
      .catch(helpers.handler);
  });

  /*
   * These tests check a few error conditions to make sure the server's API
   * doesn't break on errors.
   */
  it('handles error scenarios for simple invoicing', () => {
    // test what happens when the debtor is missing
    const missingDebtorUuid = helpers.mask(simpleInvoice, 'debtor_uuid');
    missingDebtorUuid.description = missingDebtorUuid.description.concat(' missing debtor_uuid');

    return agent.post('/invoices')
      .send({ invoice : missingDebtorUuid })
      .then(res => {
        helpers.api.errored(res, 400);

        // what happens when there is no date sent to the server
        const missingDate = helpers.mask(simpleInvoice, 'date');
        missingDate.description = missingDate.description.concat(' missing date');
        return agent.post('/invoices').send({ invoice : missingDate });
      })
      .then(res => {
        helpers.api.errored(res, 400);

        // what happens when no items are sent to the server
        const missingItems = helpers.mask(simpleInvoice, 'items');
        missingItems.description = missingItems.description.concat(' missing items');
        return agent.post('/invoices').send({ invoice : missingItems });
      })
      .then(res => {
        helpers.api.errored(res, 400);

        // what happens when no description is sent to the server
        const missingDescription = helpers.mask(simpleInvoice, 'description');
        return agent.post('/invoices').send({ invoice : missingDescription });
      })
      .then(res => {
        helpers.api.errored(res, 400);

        // make sure an empty object fails
        const emptyObject = {};
        return agent.post('/invoices').send({ invoice : emptyObject });
      })
      .then(res => {
        helpers.api.errored(res, 400);
      })
      .catch(helpers.handler);
  });

  /*
   * This scenario tests that billing services work properly.  The simple
   * billing service invoice will include a single billing service, and checks
   * that the cost is correctly calculated.
   *
   * Implicit Checks:
   *  1) `user_id` is not required (default : current user)
   */
  const simpleInvoicingFeeInvoice = {
    date : new Date('2016-01-28').toISOString(),
    cost  : 100,
    description : 'An invoice of two items costing $100 + a billing service',
    service_id : helpers.data.ADMIN_SERVICE,
    debtor_uuid : '3BE232F9A4B94AF6984CJ5D3F87D5C107',
    project_id : helpers.data.PROJECT,

    /* @todo - change this API to not need credit/debit fields */
    items  : [{
      inventory_uuid : helpers.data.MULTIVITAMINE,
      quantity : 15,
      inventory_price : 5,
      transaction_price : 5,
      credit : 75,
    }, {
      inventory_uuid : helpers.data.PREDNISONE,
      quantity : 1,
      inventory_price : 25,
      transaction_price : 25,
      credit : 25,
    }],

    invoicingFees  : [1],
  };

  it('creates and posts a patient invoice (simple + 1 invoicing fee)', () => {
    return agent.post('/invoices')
      .send({ invoice : simpleInvoicingFeeInvoice })
      .then(res => {
        helpers.api.created(res);

        // make sure we can locate the invoice in the database
        return agent.get('/invoices/'.concat(res.body.uuid));
      })
      .then(res => {
        expect(res).to.have.status(200);
        expect(res).to.be.json;

        // ensure the data in the database is correct
        const invoice = res.body;

        // this is the invoice cost ($100) + 20% ($20) of invoicing fee
        expect(invoice.cost).to.equal(120);
        expect(invoice.items).to.have.length(2);
      })
      .catch(helpers.handler);
  });


  /*
   * This scenario tests that subsidies work properly.  The simple subsidy will
   * absorb some of a patient's cost into a subsidy account.  The API only
   * supports a single subsidy per invoice.  See #343 for more information.
   */
  const simpleSubsidyInvoice = {
    date : new Date('2016-01-28').toISOString(),
    cost : 39.34,
    description : 'An invoice of three items costing $39.34 + a subsidy',
    service_id : helpers.data.ADMIN_SERVICE,
    debtor_uuid : '3BE232F9A4B94AF6984CJ5D3F87D5C107',
    project_id : helpers.data.PROJECT,

    /* @todo - change this API to not need credit/debit fields */
    items  : [{
      inventory_uuid : helpers.data.QUININE,
      quantity : 25,
      inventory_price : 0.25,
      transaction_price : 0.21,
      credit : 5.25,
    }, {
      inventory_uuid : helpers.data.PREDNISONE,
      quantity : 7,
      inventory_price : 4.87,
      transaction_price : 4.87,
      credit : 34.09,
    }, {
      inventory_uuid : helpers.data.PARACETEMOL,
      quantity  : 13,
      inventory_price  : 2.50,
      transaction_price  : 3.15,
      credit : 40.95,
    }],
    subsidies  : [1],
  };

  it('creates and posts a patient invoice (simple + 1 subsidy)', () => {
    return agent.post('/invoices')
      .send({ invoice : simpleSubsidyInvoice })
      .then(res => {
        helpers.api.created(res);

        // make sure we can locate the invoice in the database
        return agent.get(`/invoices/${res.body.uuid}`);
      })
      .then(res => {
        expect(res).to.have.status(200);
        expect(res).to.be.json;

        // ensure the data in the database is correct
        const invoice = res.body;

        // this is the cost ($80.29) - 50% ($40.145) of subsidy
        expect(invoice.cost).to.equal(40.145);
        expect(invoice.items).to.have.length(3);
      })
      .catch(helpers.handler);
  });

  it('DELETE /transactions/:uuid deletes an invoice', () => {
    return agent.delete(`/transactions/${SIMPLE_UUID}`)
      .then(res => {
        expect(res).to.have.status(201);
        return agent.get(`/invoices/${SIMPLE_UUID}`);
      })
      .then(res => {
        helpers.api.errored(res, 404);
      })
      .catch(helpers.handler);
  });
}
