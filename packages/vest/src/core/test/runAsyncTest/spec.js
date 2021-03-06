import _ from 'lodash';
import resetState from '../../../../testUtils/resetState';
import { OPERATION_MODE_STATEFUL } from '../../../constants';
import runWithContext from '../../../lib/runWithContext';
import Context from '../../Context';
import * as state from '../../state';
import { KEY_CANCELED } from '../../state/constants';
import getState from '../../suite/getState';
import patch from '../../suite/patch';
import register from '../../suite/register';
import VestTest from '../lib/VestTest';
import { setPending } from '../lib/pending';
import runAsyncTest from '.';

const STATEMENT = 'some statement string';

const CASE_PASSING = 'passing';
const CASE_FAILING = 'failing';

describe.each([CASE_PASSING, CASE_FAILING])('runAsyncTest: %s', testCase => {
  let testObject, context, fieldName, suiteId;

  const runRunAsyncTest = (...args) =>
    runWithContext(context, () => runAsyncTest(...args));

  beforeAll(() => {
    resetState();
  });

  beforeEach(() => {
    fieldName = 'field_1';
    suiteId = 'suiteId_1';
    context = new Context({
      name: 'suite_name_1',
      suiteId,
      operationMode: OPERATION_MODE_STATEFUL,
    });

    register(context);
    patch(suiteId, state => ({
      ...state,
      fieldCallbacks: {
        ...state.fieldCallbacks,
        [fieldName]: state.fieldCallbacks[fieldName] || [],
      },
    }));

    testObject = new VestTest({
      fieldName,
      statement: STATEMENT,
      suiteId,
      testFn: () => null,
    });
    testObject.asyncTest =
      testCase === CASE_PASSING ? Promise.resolve() : Promise.reject();
    setPending(testObject);
  });

  afterEach(() => {
    Context.clear();
  });

  describe('State updates', () => {
    test('Initial state matches snapshot (sanity)', () => {
      expect(getState(suiteId).pending).toContain(testObject);
      expect(getState(suiteId)).toMatchSnapshot();
      runRunAsyncTest(testObject);
    });

    it('Should remove test from pending array', () =>
      new Promise(done => {
        runRunAsyncTest(testObject);
        setTimeout(() => {
          expect(getState(suiteId).pending).not.toContain(testObject);
          done();
        });
      }));

    describe('When test is canceled', () => {
      let currentState;
      beforeEach(() => {
        state.set(state => {
          state[KEY_CANCELED][testObject.id] = true;
          return state;
        });
        currentState = _.cloneDeep(getState(suiteId));
      });

      it('Should remove test from pending array', () => {
        expect(getState(suiteId).pending).toEqual(
          expect.arrayContaining([testObject])
        );
        runRunAsyncTest(testObject);
        return new Promise(done => {
          setTimeout(() => {
            expect(getState(suiteId).pending).toEqual(
              expect.not.arrayContaining([testObject])
            );
            done();
          });
        });
      });

      it('Should remove test from canceled state', () => {
        expect(state.get()[KEY_CANCELED]).toHaveProperty(testObject.id);
        runRunAsyncTest(testObject);
        return new Promise(done => {
          setTimeout(() => {
            expect(state.get()[KEY_CANCELED]).not.toHaveProperty(testObject.id);
            done();
          });
        });
      });

      it('Should keep rest of the state unchanged', () =>
        new Promise(done => {
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(_.omit(getState(suiteId), 'pending')).toEqual(
              _.omit(currentState, 'pending')
            );
            done();
          });
        }));
    });
  });

  describe('doneCallbacks', () => {
    let fieldCallback_1, fieldCallback_2, doneCallback;
    beforeEach(() => {
      fieldCallback_1 = jest.fn();
      fieldCallback_2 = jest.fn();
      doneCallback = jest.fn();
      patch(suiteId, state => ({
        ...state,
        fieldCallbacks: {
          ...state.fieldCallbacks,
          [fieldName]: (state.fieldCallbacks[fieldName] || []).concat(
            fieldCallback_1,
            fieldCallback_2
          ),
        },
        doneCallbacks: state.doneCallbacks.concat(doneCallback),
      }));
    });
    describe('When no remaining tests', () => {
      it('Should run all callbacks', () =>
        new Promise(done => {
          expect(fieldCallback_1).not.toHaveBeenCalled();
          expect(fieldCallback_2).not.toHaveBeenCalled();
          expect(doneCallback).not.toHaveBeenCalled();
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(fieldCallback_1).toHaveBeenCalled();
            expect(fieldCallback_2).toHaveBeenCalled();
            expect(doneCallback).toHaveBeenCalled();
            done();
          });
        }));
    });

    describe('When there are more tests left', () => {
      beforeEach(() => {
        setPending(
          new VestTest({
            fieldName: 'pending_field',
            statement: STATEMENT,
            suiteId,
            testFn: jest.fn(),
          })
        );
      });

      it("Should only run current field's callbacks", () =>
        new Promise(done => {
          expect(fieldCallback_1).not.toHaveBeenCalled();
          expect(fieldCallback_2).not.toHaveBeenCalled();
          expect(doneCallback).not.toHaveBeenCalled();
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(fieldCallback_1).toHaveBeenCalled();
            expect(fieldCallback_2).toHaveBeenCalled();
            expect(doneCallback).not.toHaveBeenCalled();
            done();
          });
        }));
    });

    describe('When test is canceled', () => {
      beforeEach(() => {
        state.set(state => {
          state[KEY_CANCELED][testObject.id] = true;
          return state;
        });
      });

      it('Should return without running any callback', () =>
        new Promise(done => {
          expect(fieldCallback_1).not.toHaveBeenCalled();
          expect(fieldCallback_2).not.toHaveBeenCalled();
          expect(doneCallback).not.toHaveBeenCalled();
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(fieldCallback_1).not.toHaveBeenCalled();
            expect(fieldCallback_2).not.toHaveBeenCalled();
            expect(doneCallback).not.toHaveBeenCalled();
            done();
          });
        }));
    });
  });

  describe('testObject', () => {
    let testObjectCopy;

    beforeEach(() => {
      testObject.fail = jest.fn();
      testObjectCopy = _.cloneDeep(testObject);
    });

    if (testCase === CASE_PASSING) {
      it('Should keep test object unchanged', () =>
        new Promise(done => {
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(testObject).toEqual(testObjectCopy);
            done();
          });
        }));

      it('Should return without calling testObject.fail', () =>
        new Promise(done => {
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(testObject.fail).not.toHaveBeenCalled();
            done();
          });
        }));
    }

    if (testCase === CASE_FAILING) {
      it('Should call testObject.fail', () =>
        new Promise(done => {
          runRunAsyncTest(testObject);
          setTimeout(() => {
            expect(testObject.fail).toHaveBeenCalled();
            done();
          });
        }));

      describe('When rejecting with a message', () => {
        const rejectionString = 'rejection string';
        beforeEach(() => {
          testObject.asyncTest.catch(Function.prototype);
          testObject.asyncTest = Promise.reject(rejectionString);
        });

        it('Should set test statement to rejection string', () =>
          new Promise(done => {
            runRunAsyncTest(testObject);
            setTimeout(() => {
              expect(testObject.statement).toBe(rejectionString);
              done();
            });
          }));
      });
    }
  });
});
