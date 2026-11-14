import { describe, expect, it } from "vitest";
import entries from "../lib/content/decoder.json" with { type: "json" };
import { cleanRejectionText, decode, findGuidelines, ourChecks, REJECTION_TEXT_MAX } from "../lib/decoder";

const CRASH = `Hello,

Thank you for your submission. Upon review, we found the following issue.

Guideline 2.1 - Performance - App Completeness

We were unable to review your app as it crashed on launch. We have attached detailed crash logs to help troubleshoot this issue.

Review device details:

- Device type: iPhone 13 mini
- OS version: iOS 17.1

Next Steps

To resolve this issue, please revise your app and test it on a device to ensure it launches without crashing.

Submission ID: 4b7e1f02-9c1d-4a8e-b0a6-2d3f5c6e7a81
Version 1.0.2 (14)`;

const DELETE_AND_LOGIN = `Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage

Issue Description

The app supports account creation but does not include an option to initiate account deletion. Apps that support account creation must also offer account deletion to give users more control of the data they've shared while using an app.

Next Steps

If you're unsure what qualifies as account deletion, please review Guideline 5.1.1(v) again.

Guideline 4.8 - Design - Login Services

The app uses a third-party login service, but does not appear to offer an equivalent login option with the following features:

- The login option limits data collection to the user's name and email address.`;

const RESUBMISSION = `Hello,

Thank you for your resubmission. We noticed that your app still does not comply with Guidelines 2.1 and 5.1.1. We were not able to sign in with the demo account you provided, and the privacy policy link in the app leads to a page that does not load.

Please see the attached screenshot for details. If you have any questions, you can reply to this message in App Store Connect.`;

const SPAM = `Guideline 4.3(a) - Design - Spam

We noticed your app shares a similar binary, metadata, and/or concept as apps submitted to the App Store by other developers, with only minor differences.

Next Steps

Since we do not accept spam apps on the App Store, we encourage you to review your app concept and submit a unique app. Please note that further submissions of this kind may be treated as described in guideline 4.3(a).`;

const SCREENSHOTS = `We noticed an issue in your app that contributes to a lower quality user experience than App Store users expect.

Guideline 2.3.3 - Performance - Accurate Metadata

The 13-inch iPad screenshots show an iPhone image that has been modified or stretched to appear to be an iPad image.

Guideline 3.1.1 - Business - Payments - In-App Purchase

We noticed that your app includes a link to purchase a "Pro" subscription through an external website (stripe.com, 9.99 USD). Guidelines 2.3.3, 3.1.1, and 2.1 still apply to future updates.`;

describe("findGuidelines", () => {
  it.each([
    ["a crash on launch", CRASH, ["2.1"]],
    ["account deletion and login services", DELETE_AND_LOGIN, ["5.1.1(v)", "4.8"]],
    ["a resubmission naming two guidelines in one sentence", RESUBMISSION, ["2.1", "5.1.1"]],
    ["spam with a lower-case repeat", SPAM, ["4.3(a)"]],
    ["metadata and payments with a list at the end", SCREENSHOTS, ["2.3.3", "3.1.1", "2.1"]],
  ])("finds the guidelines in %s, in order and once each", (_name, text, numbers) => {
    expect(findGuidelines(text)).toEqual(numbers);
  });

  it("ignores numbers that do not follow the word Guideline", () => {
    expect(findGuidelines("Version 1.0.2 crashed on iOS 17.1. Please read section 5.1.1 of our terms.")).toEqual([]);
  });

  it("reads upper-case and spaced sub-items the same way", () => {
    expect(findGuidelines("GUIDELINE 5.1.1 (V) and Guideline 5.1.1(v)")).toEqual(["5.1.1(v)"]);
  });
});

describe("decode", () => {
  it("returns the entry for an exact number", () => {
    expect(decode("5.1.1(v)")).toMatchObject({ guideline: "5.1.1(v)", ourCheck: "R6", fellBack: false });
  });

  it("reads Apple's 4.0 as the design rule 4", () => {
    expect(findGuidelines("Guideline 4.0 - Design")).toEqual(["4.0"]);
    expect(decode("4.0")).toMatchObject({ guideline: "4", fellBack: false });
    expect(decode("4")).toMatchObject({ guideline: "4", fellBack: false });
  });

  it("falls back to the parent and says so", () => {
    expect(decode("2.1(c)")).toMatchObject({ guideline: "2.1", ourCheck: "R1, R2, R3, R4", fellBack: true });
    expect(decode("2.3.3(b)")).toMatchObject({ guideline: "2.3.3", fellBack: true });
    expect(decode("5.1.1(iv)")).toMatchObject({ guideline: "5.1.1", ourCheck: "R5, R6", fellBack: true });
  });

  it("returns undefined when neither the number nor a parent has an entry", () => {
    expect(decode("2.5.2")).toBeUndefined();
    expect(decode("1.4")).toBeUndefined();
  });

  it("has the 32 checked entries, each number once", () => {
    expect(entries).toHaveLength(32);
    expect(new Set(entries.map((e) => e.guideline)).size).toBe(32);
  });

  it("knows every entry in the data file", () => {
    for (const e of entries) expect(decode(e.guideline)).toMatchObject({ ...e, fellBack: false });
  });
});

describe("ourChecks", () => {
  it("splits and trims the named rules", () => {
    expect(ourChecks({ ourCheck: "R6" })).toEqual(["R6"]);
    expect(ourChecks({ ourCheck: "R1, R2,R3 ,  R4" })).toEqual(["R1", "R2", "R3", "R4"]);
    expect(ourChecks({ ourCheck: "" })).toEqual([]);
    expect(ourChecks(decode("2.1")!)).toEqual(["R1", "R2", "R3", "R4"]);
  });
});

describe("cleanRejectionText", () => {
  it("trims and cuts at the limit", () => {
    expect(cleanRejectionText("  Guideline 2.1  ")).toBe("Guideline 2.1");
    expect(cleanRejectionText(" " + "a".repeat(REJECTION_TEXT_MAX + 50))).toHaveLength(REJECTION_TEXT_MAX);
    expect(cleanRejectionText("Guideline 2.1\r\n\r\nWe were unable")).toBe("Guideline 2.1\n\nWe were unable");
    expect(cleanRejectionText(undefined)).toBe("");
    expect(cleanRejectionText(new File(["Guideline 2.1"], "message.txt"))).toBe("");
  });
});
