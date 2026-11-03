---
title: Bring Your Own LLM
linkTitle: Bring Your Own LLM
weight: 40
description: "Optional: choose a model route for an agent, test it, and check which model answered."
---

Each agent points to an LLM profile, and the profile decides which model answers. This page is optional. It explains the routes and how to test one. One investigation can use tens of thousands of tokens, so test with one agent first.

{{% notice warning %}}
Bring-your-own LLM profiles are not confirmed for general availability on every build. Run this page only if your build has LLM profiles. Never run it on a production box or a shared class box.
{{% /notice %}}

## 1. Choose a route

| Route | How the model is reached | Where the key lives |
|---|---|---|
| Default FortiSOAR route | Through the FortiAI connector. Needs a FortiAI entitlement. | Licensing. There is no key field. |
| Connector-backed route | Through an installed LLM connector, such as an OpenAI connector | Encrypted in the connector configuration |
| Native provider route | Directly to a vendor, such as OpenAI, Anthropic or Gemini | In the profile itself |

Prefer the connector-backed route. Its key stays encrypted in the connector configuration, not in the profile.

## 2. Test the route

<!-- step: fsa05-08-byo-profile manual: bring-your-own LLM profile; the page says not to run it on a shared box -->

1. Create or select a reasoning profile for the route.
2. Run a test completion with the profile's test action. Do not rely on the health check. A key on an account with no credit can pass the health check and then fail the first real call.
3. Assign the profile to one agent, in the agent's configuration.
4. Run that agent. Open its trace, find the LLM span, and check the provider and model it names.

**You are done when**

- The test completion returns text.
- The LLM span names the provider and model you configured.

Masking replaces indicators, such as addresses, hashes and emails, with placeholders before the model sees them. It is not a privacy guarantee, and it may not run on every route. Until you verify masking on your build, assume that data sent to a bring-your-own model is not masked. Use sample data only.

## 3. Check that the model returns structured output

Agents send a JSON schema and expect objects back. A model that returns text where an object is expected fails the step. Run one agent with your chosen model before you rely on it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Authorization error on every model call | No FortiAI entitlement on the default route | Ask the administrator to check the entitlement, or use a connector-backed profile |
| Health check passes, investigation fails with a quota error | The provider account has no credit | Add credit, then run the test completion again |
| Structured step fails with a type error | The model does not return the schema's object types | Switch to a model that does, and test one agent first |
| Agent still uses the old model | The agent points at the old profile | Check the agent's configuration, not only the profile |
| Profile still listed after delete | Delete does not remove it on this build | Leave it; it does no harm |
