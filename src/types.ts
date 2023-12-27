export type ProfileAction = "FORCED_NAME_CHANGE" | "USING_BANNED_SKIN";

export type MojangMinecraftProfileResponse = {
  id: string;
  name: string;
  properties: {
    name: string;
    value: string;
  }[];
  profileActions: ProfileAction[];
};

export type MojangMinecraftTexturesProperty = {
  timestamp: number;
  profileId: string;
  profileName: string;
  textures: {
    SKIN?: {
      url: string;
      metadata?: {
        model: "slim" | "steve";
      };
    };
    CAPE?: {
      url: string;
    };
  };
};

export enum DefaultSkinType {
  Steve,
  Alex,
}
