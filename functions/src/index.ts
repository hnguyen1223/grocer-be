import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { firestore } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  AIRequest,
  AIResponse,
  BASE_IMAGE_LOCATION,
  BaseGptResponse,
  BaseQuery,
  Dictionary,
  DurabiltityQuery,
  AI_MODELS,
  GPT_URLS,
  Gpt3Response,
  Gpt4Response,
  GptRole,
  GptVersion,
  LIMIT,
  QUERIES,
  QUERY_TOKEN_LIMIT,
  QueryType,
  UserType,
} from "./model";

initializeApp();
const db = firestore();
const bucket = getStorage().bucket();
const openAIKey = defineSecret("OPENAI_KEY");

exports.queryAI = onCall<AIRequest<BaseQuery>, Promise<AIResponse>>(
  { minInstances: 1, secrets: [openAIKey] },
  async ({ data: { id, gpt, queryType, query }, auth, rawRequest }) => {
    if (!auth?.uid && !rawRequest.ip) {
      throw new HttpsError("unauthenticated", "User not signed in");
    }
    if (!id || !query) {
      throw new HttpsError("invalid-argument", "missing argument");
    }

    if (gpt !== GptVersion.THREE && gpt !== GptVersion.FOUR) {
      throw new HttpsError(
        "invalid-argument",
        `gpt version ${gpt} not supported`
      );
    }

    if (Object.values(QueryType).indexOf(queryType) === -1) {
      throw new HttpsError(
        "invalid-argument",
        `query type ${queryType} not supported`
      );
    }

    const uid = auth?.uid ?? rawRequest.ip;
    if (!openAIKey.value() || !uid) {
      throw new HttpsError("internal", "API Error");
    }
    const userType = auth?.uid ? UserType.USER : UserType.GUEST;
    const limit = LIMIT[userType];
    const usage =
      (await db.doc(`${userType}s/${uid}`).get())?.get("weeklyUsage") ?? 0;
    if (usage > limit) {
      throw new HttpsError(
        "resource-exhausted",
        `Usage limit for ${userType} reached weekly limit of ${limit}`
      );
    }

    const url = GPT_URLS[gpt] ?? GPT_URLS[GptVersion.THREE];
    const body = getQueryBody(gpt, queryType, query);

    try {
      const startTime = Date.now();
      const response = await axios.post<BaseGptResponse>(url, body, {
        headers: getQueryHeaders(),
      });
      const response_time = Date.now() - startTime;
      if (response.status === 200) {
        logRequest(
          userType,
          uid,
          id,
          queryType === QueryType.DURABILITY
            ? (<DurabiltityQuery>query).stuffLocation
            : queryType,
          {
            ...response.data.usage,
            finish_reason: response.data.choices[0].finish_reason,
            model: AI_MODELS[gpt],
            response_time,
          }
        );
        return {
          response: {
            id,
            content:
              gpt === GptVersion.FOUR
                ? (<Gpt4Response>response.data).choices[0].message.content
                : (<Gpt3Response>response.data).choices[0].text,
            finish_reason: response.data.choices[0].finish_reason,
            model: response.data.model,
          },
        };
      } else {
        throw new HttpsError("internal", "Request failed.");
      }
    } catch (error: any) {
      throw new HttpsError("internal", error.message);
    }
  }
);

exports.logObjectRequest = onDocumentCreated("objects/{id}", async (event) => {
  const doc = event.data;
  if (doc) {
    const filePath: string = doc.get("file");
    const file = bucket.file(
      filePath.slice(filePath.indexOf(BASE_IMAGE_LOCATION))
    );
    const ids = filePath
      .slice(filePath.indexOf(BASE_IMAGE_LOCATION) + BASE_IMAGE_LOCATION.length)
      .split(".")[0]
      .split("_");
    const fileMetadata = (await file.getMetadata())[0];
    const response_time =
      new Date(event.time).getUTCMilliseconds() - new Date(fileMetadata.timeCreated).getUTCMilliseconds();
    logRequest(UserType.USER, ids[0], ids[1], QueryType.OBJECT, {
      objects: doc.get("objects"),
      model: "Google Cloud Vision",
      response_time,
    });
    file.delete();
    doc.ref.delete();
  }
});

function getQueryHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${openAIKey.value()}`,
  };
}

function getQueryBody(gpt: GptVersion, type: QueryType, query: any) {
  const prompt = QUERIES[gpt][type]?.(query);
  const baseQuery = {
    temperature: 0,
    model: AI_MODELS[gpt],
    max_tokens: QUERY_TOKEN_LIMIT[type],
  };
  return gpt === GptVersion.THREE
    ? { ...baseQuery, prompt }
    : {
      ...baseQuery,
      ...(type === QueryType.DURABILITY
        ? { response_format: { type: "json_object" } }
        : {}),
      messages: [{ role: GptRole.USER, content: prompt }],
    };
}

function logRequest(
  userType: UserType,
  uid: string,
  id: string,
  kind: string,
  log: Dictionary
): void {
  db.doc(`${userType}s/${uid}`).set(
    { weeklyUsage: FieldValue.increment(1) },
    { merge: true }
  );
  db.doc(`${userType}s/${uid}/requests/${id}`).set(
    {
      id,
      [kind]: {
        ...log,
        timestamp: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}
