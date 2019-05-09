"use strict";

const HIBP = require("../hibp");
const DB = require("../db/DB");
const getSha1 = require("../sha1-utils");

require("./resetDB");


jest.mock("../hibp");
jest.mock("../basket");


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


test("getSubscriberByToken accepts token and returns subscriber", async () => {
  const testEmail = "unverifiedemail@test.com";
  const testToken = "0e2cb147-2041-4e5b-8ca9-494e773b2cf0";
  const subscriber = await DB.getSubscriberByToken(testToken);

  expect(subscriber.primary_email).toBe(testEmail);
  expect(subscriber.primary_verification_token).toBe(testToken);
});

test("getSubscribersByHashes accepts hashes and only returns verified subscribers", async () => {
  const testHashes = [
    "firefoxaccount@test.com",
    "unverifiedemail@test.com",
    "verifiedemail@test.com",
  ].map(email => getSha1(email));
  const subscribers = await DB.getSubscribersByHashes(testHashes);
  for (const subscriber of subscribers) {
    expect(subscriber.primary_verified).toBeTruthy();
  }
});


test("getEmailAddressesByHashes accepts hashes and only returns verified email_addresses", async () => {
  const testHashes = [
    "firefoxaccount-secondary@test.com",
    "firefoxaccount-tertiary@test.com",
  ].map(email => getSha1(email));
  const emailAddresses = await DB.getEmailAddressesByHashes(testHashes);
  for (const emailAddress of emailAddresses) {
    expect(emailAddress.verified).toBeTruthy();
  }
});


test("addSubscriberUnverifiedEmailHash accepts user and email and returns unverified email_address with sha1 hash and verification token", async () => {
  const testEmail = "test@test.com";
  // https://stackoverflow.com/a/13653180
  const uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const subscriber = await DB.getSubscriberByEmail("firefoxaccount@test.com");

  const unverifiedEmailAddress = await DB.addSubscriberUnverifiedEmailHash(subscriber, testEmail);
  expect(unverifiedEmailAddress.sha1).toBe(getSha1(testEmail));
  expect(uuidRE.test(unverifiedEmailAddress.verification_token)).toBeTruthy();
  expect(unverifiedEmailAddress.verified).toBeFalsy();
});


test("verifyEmailHash accepts token and returns verified subscriber", async () => {
  const testEmail = "verifyEmailHash@test.com";
  const subscriber = await DB.getSubscriberByEmail("firefoxaccount@test.com");

  const unverifiedEmailAddress = await DB.addSubscriberUnverifiedEmailHash(subscriber, testEmail);
  expect(unverifiedEmailAddress.verified).toBeFalsy();

  HIBP.subscribeHash.mockResolvedValue(true);
  const verifiedEmailAddress = await DB.verifyEmailHash(unverifiedEmailAddress.verification_token);
  expect(verifiedEmailAddress.sha1).toBe(getSha1(testEmail));
  expect(verifiedEmailAddress.verified).toBeTruthy();
});


test("addSubscriber invalid argument", async () => {
  const testEmail = "test".repeat(255);

  await expect(DB.addSubscriber(testEmail)).rejects.toThrow("error-could-not-add-email");
});


test("addSubscriber accepts email, language and returns verified subscriber", async () => {
  const testEmail = "newFirefoxAccount@test.com";

  const verifiedSubscriber = await DB.addSubscriber(testEmail);

  expect(verifiedSubscriber.primary_email).toBe(testEmail);
  expect(verifiedSubscriber.primary_verified).toBeTruthy();
  expect(verifiedSubscriber.primary_sha1).toBe(getSha1(testEmail));
});


test("addSubscriber with existing email updates updated_at", async () => {
  const testEmail = "newFirefoxAccount@test.com";

  let verifiedSubscriber = await DB.addSubscriber(testEmail);

  expect(verifiedSubscriber.primary_email).toBe(testEmail);
  expect(verifiedSubscriber.primary_verified).toBeTruthy();
  expect(verifiedSubscriber.primary_sha1).toBe(getSha1(testEmail));
  const updatedAt = verifiedSubscriber.updated_at;

  await sleep(1000);

  verifiedSubscriber = await DB.addSubscriber(testEmail);

  expect(verifiedSubscriber.primary_email).toBe(testEmail);
  expect(verifiedSubscriber.primary_verified).toBeTruthy();
  expect(verifiedSubscriber.primary_sha1).toBe(getSha1(testEmail));
  expect(verifiedSubscriber.updated_at).not.toBe(updatedAt);
});


test("setBreachesLastShown updates column and returns subscriber", async() => {
  const startingSubscriber = await DB.getSubscriberByEmail("firefoxaccount@test.com");

  await sleep(1000);
  await DB.setBreachesLastShownNow(startingSubscriber);

  const updatedSubscriber = await DB.getSubscriberByEmail(startingSubscriber.primary_email);
  expect (new Date(updatedSubscriber.breaches_last_shown).getTime()).toBeGreaterThan(new Date(startingSubscriber.breaches_last_shown).getTime());
});


test("removeSubscriber accepts email and removes the email address", async () => {
  const testEmail = "removingFirefoxAccount@test.com";

  const verifiedSubscriber = await DB.addSubscriber(testEmail);
  let subscribers = await DB.getSubscribersByHashes([getSha1(testEmail)]);
  expect(subscribers.length).toEqual(1);

  await DB.removeSubscriberByEmail(verifiedSubscriber.primary_email);
  subscribers = await DB.getSubscribersByHashes([getSha1(testEmail)]);
  expect(subscribers.length).toEqual(0);
});
