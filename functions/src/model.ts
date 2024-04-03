export enum UserType {
  USER = "user",
  GUEST = "guest",
}

export enum GptVersion {
  THREE = "3.5",
  FOUR = "4",
}


export const GPT_MODELS = {
  [GptVersion.THREE]: "gpt-3.5-turbo-instruct",
  [GptVersion.FOUR]: "gpt-4-0125-preview",
}


export const GPT_URLS = {
  [GptVersion.THREE]: "https://api.openai.com/v1/completions",
  [GptVersion.FOUR]: "https://api.openai.com/v1/chat/completions",

}

export enum StuffLocation {
  FREEZER = "freezer",
  FRIDGE = "fridge",
  OUTSIDE = "outside",
}

export const LOCATION_AI_TEXT = {
  [StuffLocation.FREEZER]: "in freezer",
  [StuffLocation.FRIDGE]: "in fridge",
  [StuffLocation.OUTSIDE]: "outside of fridge",
}

export enum QueryType {
  DURABILITY = "durability",
  EMOJI = "emoji",
  CATEGORY = "category",
  OBJECT = "object",
}

export const QUERY_TOKEN_LIMIT = {
  [QueryType.DURABILITY]: 90,
  [QueryType.EMOJI]: 30,
  [QueryType.CATEGORY]: 60,
  [QueryType.OBJECT]: 100,
}

export const LIMIT = {
  [UserType.USER]: 200,
  [UserType.GUEST]: 50,
}

export interface AIRequest<T extends BaseQuery> {
  id: string;
  gpt: GptVersion;
  queryType: QueryType;
  query: T
}

export interface AIResponse {
  response: {
    id: string;
    content: string;
    finish_reason: string;
    model: string;
  };
}

export interface BaseQuery {
  item: string;
}

export interface DurabiltityQuery extends BaseQuery {
  stuffLocation: StuffLocation;
}

export interface BaseGptResponse {
  id: string;
  model: string;
  choices: BaseGptChoice[];
  usage: GptUsage
}

export interface BaseGptChoice {
  index: number;
  finish_reason: string;
}

export interface GptUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export enum GptRole {
  ASSISTANT = "assistant",
  USER = "user"
}

export interface Gpt3Choice extends BaseGptChoice {
  text: string
}

export interface Gpt3Response extends BaseGptResponse {
  choices: Gpt3Choice[];
}

export interface GptMessage {
  role: GptRole;
  content: string;
}
export interface Gpt4Choice extends BaseGptChoice {
  message: GptMessage;
}

export interface Gpt4Response extends BaseGptResponse {
  choices: Gpt4Choice[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const QUERIES: { [key in GptVersion]: { [key in QueryType]?: (query: any) => string } } = {
  [GptVersion.THREE]: {
    [QueryType.DURABILITY]: (query) => `get ${query.item} shelf life ${getLocationText(query.stuffLocation)}, in JSON format {h: number, d: number, r:boolean, c:string}, h:number of hours, d: number of days, r: is this recommended, c:comment strictly under 20 words.`,
    [QueryType.EMOJI]: (query) => `represent ${query.item} (food) with 1 emoji, no explaination`,
  },
  [GptVersion.FOUR]: {
    [QueryType.DURABILITY]: (query) => `${query.item} shelf life ${getLocationText(query.stuffLocation)}, JSON {h: number, d: number, r:boolean, c:string}, h:number of hours, d: number of days, r: is this recommended, c:comment strictly under 20 words. No new lines`,
    [QueryType.EMOJI]: (query) => `only 1 emoji for ${query.item} (food), no explaination`,
    [QueryType.CATEGORY]: (query) => `which category in Meal,Seafood,Dairy,Meat,Produce,Condiments,Drinks,Others,Grains,Baked,Canned,Snacks,Sauces,Spices,Oils does ${query.item} belong, no explaination`,
  },
}

function getLocationText(stuffLocation: StuffLocation): string {
  return LOCATION_AI_TEXT[stuffLocation] ?? "in " + stuffLocation
}