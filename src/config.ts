import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const SERVER_URL =
    process.env.NODE_ENV === 'development'
        ? process.env.TUNNEL_SERVER_URL
        : 'https://tunnl.hetheringtons.live';

const APP_AGENT_VERSION =
    process.env.NODE_ENV === 'development'
        ? process.env.AGENT_VERSION
        : '1.0.3';

export const DEFAULT_TUNNEL_SERVER = SERVER_URL;
export const AGENT_VERSION = APP_AGENT_VERSION;
