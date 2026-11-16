import data from "./third-party.json";

export interface ThirdPartyPackage {
  name: string;
  version: string;
  license: string;
  copyright: string | null;
  repository: string | null;
  npm: string;
}

export const thirdPartyPackages: ThirdPartyPackage[] = data.packages;
