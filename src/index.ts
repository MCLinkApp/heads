import { Hono } from "hono";
import { validator } from "hono/validator";
import { cors } from "hono/cors";
import { defaultHeads, indexText } from "./consts";
import { MojangMinecraftProfileResponse, MojangMinecraftTexturesProperty } from "./types";
import { colorSig, Timings, uuidToDefaultSkinType } from "./util";
import * as png from "@stevebel/png";
import Metadata from "@stevebel/png/lib/helpers/metadata";
import { COLOR_TYPES } from "@stevebel/png/lib/helpers/color-types";

type Bindings = {
  KV_STORE: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET"],
  }),
);

app.get("/", (c) => c.text(indexText));

app.get(
  "/:uuid",
  validator("param", (value, c) => {
    let uuid = value["uuid"].trim().replaceAll("-", "");
    uuid.endsWith(".png") && (uuid = uuid.slice(0, -4));

    return /^[0-9a-f]{32}$/.test(uuid) ? { uuid } : c.text("Invalid UUID", 400);
  }),
  async (c) => {
    const timings = new Timings();
    const uuid = c.req.valid("param").uuid;
    const sendTimings = !!c.req.query("timings");

    timings.start("total");
    timings.start("profile-req");
    const profileResponse = await fetch(
      `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,
      { headers: { "User-Agent": "CLHeads/1.0" } },
    );
    timings.stop("profile-req");

    if (profileResponse.status === 204) {
      console.log(`Player ${uuid} not found`);
      return c.text("Player not found", 404);
    } else if (profileResponse.status !== 200) {
      console.error(`Mojang API error: ${profileResponse.status}`);
      console.error(
        "Response headers: ",
        JSON.stringify(Object.fromEntries(profileResponse.headers.entries())),
      );
      console.error("Response body: ", await profileResponse.text());

      return c.text("Mojang API error", 500);
    }

    const profileData = (await profileResponse.json()) as MojangMinecraftProfileResponse;

    const encodedTexturesData = profileData.properties[0].value;
    const texturesData = JSON.parse(atob(encodedTexturesData)) as MojangMinecraftTexturesProperty;
    const skinUrl = texturesData.textures.SKIN?.url;

    let headImage: ArrayBuffer | Uint8Array | null;

    if (skinUrl) {
      console.log(`Got skin URL: ${skinUrl}`);

      const skinUrlHash = btoa(
        String.fromCharCode(
          ...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(skinUrl))),
        ),
      );

      console.log(`Skin URL hash: ${skinUrlHash}`);

      timings.start("get-cache");
      headImage = await c.env.KV_STORE.get("head-cache:" + skinUrlHash, "arrayBuffer");
      timings.stop("get-cache");

      if (headImage) {
        console.log(`Cache HIT for: ${skinUrlHash}`);
      } else {
        console.log(`Cache miss for: ${skinUrlHash}`);

        timings.start("skin-req");
        const skinResponse = await fetch(skinUrl, { headers: { "User-Agent": "CLHeads/1.0" } });
        timings.stop("skin-req");

        if (!skinResponse.ok) {
          console.log(`Skin request failed: ${skinResponse.status}`);
          return c.text("Skin request failed", 500);
        }

        timings.start("gen-img");
        const skinPng = png.decode(await skinResponse.arrayBuffer());

        const headImgData = Array(8 * 8 * 4);

        const transparencySig = colorSig(skinPng.data, 0);

        for (let i = 0; i < 8 * 8; i++) {
          const x = (i % 8) + 8;
          const y = Math.floor(i / 8) + 8;
          const yOffset = y * 4 * skinPng.width;

          const facePixel = yOffset + x * 4;
          const hatPixel = yOffset + (x + 32) * 4;

          const hatAlpha =
            colorSig(skinPng.data, hatPixel) === transparencySig
              ? 0
              : skinPng.data[hatPixel + 3] / 255;
          const hatStrength = 1 - hatAlpha;

          headImgData[i * 4] =
            skinPng.data[facePixel] * hatStrength + skinPng.data[hatPixel] * hatAlpha;
          headImgData[i * 4 + 1] =
            skinPng.data[facePixel + 1] * hatStrength + skinPng.data[hatPixel + 1] * hatAlpha;
          headImgData[i * 4 + 2] =
            skinPng.data[facePixel + 2] * hatStrength + skinPng.data[hatPixel + 2] * hatAlpha;
        }

        const headPng: Metadata = {
          colorType: COLOR_TYPES.TRUE_COLOR,
          compression: 0,
          data: headImgData,
          depth: 8,
          filter: 0,
          height: 8,
          interlace: 0,
          width: 8,
        };

        headImage = png.encode(headPng);
        timings.stop("gen-img");

        c.executionCtx.waitUntil(
          c.env.KV_STORE.put("head-cache:" + skinUrlHash, headImage, {
            expirationTtl: 60 * 60 * 24 * 7,
          }),
        );
      }
    } else {
      console.log(`Player ${uuid} has no skin`);

      headImage = defaultHeads[uuidToDefaultSkinType(uuid)];
    }

    timings.stop("total");

    return c.newResponse(headImage, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600",
        ...(sendTimings && { "Server-Timing": timings.toHeader() }),
      },
    });
  },
);

export default app;
