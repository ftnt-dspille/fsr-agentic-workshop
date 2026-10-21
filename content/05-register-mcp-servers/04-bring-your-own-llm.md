---
title: Bring Your Own LLM
linkTitle: Bring Your Own LLM
weight: 40
description: "How agents choose their model, what to verify before you trust a model route, and why structured output decides which models work."
---

Agents do not run on a fixed model. Each agent points to an LLM profile, and the profile decides which model answers. This page covers the routes an LLM profile can take and what to verify before you rely on one. It is short on purpose, because the bring-your-own route is not confirmed for general availability on every build.

{{% notice warning %}}
Support status for bring-your-own LLM profiles is not confirmed for general availability. Do not run this exercise on a production box, or on a shared class box, until your instructor or the product team confirms that your build supports it. The UI path for choosing a bring-your-own provider also differs between the sources, so use the path your build actually shows (NLV-05-15).
{{% /notice %}}

## 1. Know the routes

| Route | How the model is reached | Where the key lives | What to know |
|---|---|---|---|
| Default FortiSOAR route | Through the FortiAI connector | Licensing, not a key field | Needs a FortiAI entitlement. Without one, calls fail with an authorization error and an error code (NLV-05-19). |
| Connector-backed route | Through an installed LLM connector, such as an OpenAI connector | Encrypted in the connector configuration | The connector configuration picks the model. Keep one connector configuration per model (NLV-05-22). |
| Native provider route | Directly to a vendor client, such as OpenAI, Anthropic or Gemini | In the profile itself | Test the vendor's path on your build before you rely on it. Custom base URLs may not be supported (NLV-05-17). |

Prefer the connector-backed route for a class. It keeps the key encrypted in the connector configuration, not in the profile.

## 2. Verify the route before you trust it

A health check is not enough. A key on an account with no credit can pass the health check and then fail the first real call, and the investigation fails in normalization with a quota error (NLV-05-20).

<!-- step: fsa05-06-byo-profile manual -->

Only on a non-production box, and only if your build supports it:

1. Create or select a reasoning profile for the route.
2. Run a test completion through the profile's test action. Do not rely on the health check.
3. Assign the profile to one agent through the agent's configuration, not its record (NLV-05-23).
4. Run that agent. Open its trace and find the LLM span. Check the provider and the model it names.

**What success looks like**

- The test completion returns text.
- The LLM span names the provider and the model you configured, not a default you did not choose.

## 3. Pick a model that honors the schema

Agents send a JSON schema and expect structured objects back. A model that returns strings where the schema asks for objects will fail a step. In testing, one model completed every step, and another failed the hypothesis step on the schema (NLV-05-18).

Test one agent with your chosen model before the class. A failure there is cheaper than a failure in the middle of an investigation.

## 4. Know what leaves the platform

Masking replaces indicators such as addresses, hashes and emails with placeholders before the model sees them, then reverts the placeholders after the answer. Masking covers LLM messages. It is not a privacy guarantee, and it may not run on every route (NLV-02-13).

For a bring-your-own route, assume data leaves the platform unmasked until you verify masking on your build. Test with sample data only.

## 5. Estimate cost without quoting a price

A single investigation uses tens of thousands of tokens and dozens of model calls in testing. Use that to budget a class run. Do not quote a price. Pricing for the default route is not confirmed, and sources disagree (NLV-00-05).

{{% notice note %}}
Deleting a profile in the UI may not remove it on every build. After you delete one, check the list. If it is still there, overwrite it or leave it, and tell your instructor (NLV-05-21).
{{% /notice %}}

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Authorization error on every model call | No FortiAI entitlement on the default route | Ask the administrator to check the entitlement, or use a connector-backed profile (NLV-05-19) |
| Health check passes, investigation fails with a quota error | The provider account has no credit | Top up the account, then run the test completion again (NLV-05-20) |
| Structured step fails with a type error | The model does not honor the response schema | Switch to a model that does, and test one agent first (NLV-05-18) |
| Agent still uses the old model | The agent is pointed at the old profile | Check the agent's configuration, not only the profile (NLV-05-23) |
| Profile still in the list after delete | Delete did not remove it on this build | Leave it, overwrite it, and tell your instructor (NLV-05-21) |
| Trace shows an unexpected provider | The route is a default you did not set | Set the profile on the agent explicitly, then run again |

<!-- NLV: NLV-00-05, NLV-02-13, NLV-05-15, NLV-05-17, NLV-05-18, NLV-05-19, NLV-05-20, NLV-05-21, NLV-05-22, NLV-05-23 -->
