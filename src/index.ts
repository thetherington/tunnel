#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { TunnelClientService } from './services/tunnel-client.service';
import { DEFAULT_TUNNEL_SERVER, AGENT_VERSION } from './config';

dotenv.config({ quiet: true });

const program = new Command();

program
    .name('tunnel')
    .description('A CLI tool for creating secure tunnels to localhost')
    .version(AGENT_VERSION!);

/**
 * HTTP Tunnel Command
 *
 * This command starts an HTTP tunnel that forwards traffic from a public URL to a local port.
 * Locally:    npm run dev -- http <port> -t <token>
 * Production: tunnel http <port> -t <token>
 */
program
    .command('http')
    .description('Start an HTTP tunnel to forward traffic to a local port')
    .argument('<port>', 'Local port to forward traffic to')
    .requiredOption('-t, --token <token>', 'Authentication token (required)')
    .option('--subdomain <subdomain>', 'Request a specific subdomain')
    .option('--server <url>', 'Tunnel Server URL', DEFAULT_TUNNEL_SERVER)
    .option('--no-reconnect', 'Disable automatic reconnection')
    .action(async (port: string, options: any) => {
        console.log(options);

        const localPort = parseInt(port, 10);
        if (isNaN(localPort) || localPort <= 0 || localPort > 65535) {
            console.error(chalk.red('Error: Invalid local port number'));
            process.exit(1);
        }

        console.log(chalk.green('Starting tunnel....'));
        console.log(chalk.gray(`Local service: http://localhost:${localPort}`));
        console.log(chalk.gray(`Tunnel Server: ${options.server}`));

        if (options.subdomain) {
            console.log(
                chalk.gray(`Requested subdomain: ${options.subdomain}`),
            );
        }

        const client = new TunnelClientService({
            serverUrl: options.server,
            localPort,
            subdomain: options.subdomain,
            token: options.token,
            reconnect: options.reconnect,
        });

        try {
            await client.connect();

            // Handle graceful shutdown on SIGINT (Ctrl+C)
            const shutdownHandler = () => {
                console.log(chalk.yellow('\nShutting down tunnel...'));
                client.disconnect();
                process.exit(0);
            };

            process.on('SIGINT', shutdownHandler);
            process.on('SIGTERM', shutdownHandler);

            // Keep the process running until it is terminated
            process.stdin.resume();
        } catch (error) {
            console.error(chalk.red('Error connecting to tunnel server'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
            process.exit(1);
        }
    });

/**
 * Check Tunnel Status
 *
 * This command checks the status of the tunnel server and lists active tunnels.
 * Locally:    npm run dev -- status
 * Production: tunnel status
 */
program
    .command('status')
    .description('Check the status of the tunnel')
    .option('--server <url>', 'Tunnel Server URL', DEFAULT_TUNNEL_SERVER)
    .action(async (options: any) => {
        try {
            const serverUrl = options.server;

            const axios = require('axios');
            const response = await axios.get(`${serverUrl}/api/status`, {
                timeout: 5000,
            });

            console.log(chalk.cyan('Tunnel Server Status:'));
            console.log(chalk.gray('-'.repeat(50)));

            if (response.data.tunnels && response.data.tunnels.length > 0) {
                console.log(
                    chalk.green(
                        `Active tunnels: ${response.data.tunnels.length}\n`,
                    ),
                );

                response.data.tunnels.forEach((tunnel: any) => {
                    console.log(chalk.white(`Subdomain: ${tunnel.subdomain}`));
                    console.log(
                        chalk.gray(
                            ` Connected: ${new Date(tunnel.connectedAt).toLocaleString()}`,
                        ),
                    );
                    console.log(
                        chalk.gray(
                            `  Pending requests: ${tunnel.pendingRequests}`,
                        ),
                    );
                    console.log();
                });
            } else {
                console.log(chalk.yellow('No active tunnels'));
            }
            process.exit(0);
        } catch (error) {
            console.error(chalk.red('Error fetching status'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
            process.exit(1);
        }
    });

const authTokenCommand = program
    .command('token')
    .description('Manage authentication tokens');
/**
 * Generate Quick Test Token Command
 *
 * This command generates a temporary authentication token for quick testing without requiring signup.
 * Locally:    npm run dev -- token generate-quick
 * Production: tunnel token generate-quick
 */
authTokenCommand
    .command('generate-quick')
    .description(
        'Generate a temporary authentication token for quick testing (no signup required)',
    )
    .action(async () => {
        try {
            console.log(chalk.cyan('Generating no-auth token...'));
            console.log(chalk.gray('-'.repeat(50)));

            // Generate a random token with "noauth-" prefix to indicate it's a quick token
            const crypto = require('crypto');
            const randomToken = crypto.randomBytes(32).toString('hex');
            const token = `noauth-${randomToken}`;

            console.log(
                chalk.green('✓ No-auth token generated successfully\n'),
            );
            console.log(chalk.cyan('Token Details:'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.yellow(`Token: ${token}\n`));
            console.log(chalk.bgCyan.black(' QUICK TEST TOKEN '));
            console.log(
                chalk.cyan(
                    'This token does not require signup and is perfect for quick testing.\n',
                ),
            );
            console.log(chalk.gray('Use this token with:'));
            console.log(chalk.white(`  tunnel http <port> -t ${token}`));
            console.log(chalk.gray('Or set it as an environment variable:'));
            console.log(chalk.white(`  export TUNNEL_TOKEN=${token}\n`));
            console.log(
                chalk.yellow('Note: This token is not stored in any database.'),
            );
            console.log(
                chalk.yellow(
                    'For production use, create an account and use "tunnel token create" instead.\n',
                ),
            );
        } catch (error) {
            console.error(chalk.red('\n✗ Error generating token:'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            } else {
                console.error(chalk.red(error));
            }
            process.exit(1);
        }
    });

/**
 * Create Auth Token Command
 *
 * This command creates a new authentication token for the user.
 * Locally:    npm run dev -- token create --email <email> --password <password> --name <name>
 * Production: tunnel token create --email <email> --password <password> --name <name>
 */
authTokenCommand
    .command('create')
    .description('Create a new authentication token')
    .requiredOption('-e, --email <email>', 'Your account email')
    .requiredOption('-p, --password <password>', 'Your account password')
    .requiredOption(
        '-n, --name <name>',
        'Name for the token (e.g., "my-dev-token")',
    )
    .option('--server <url>', 'Tunnel server URL', DEFAULT_TUNNEL_SERVER)
    .action(async (options: any) => {
        try {
            const serverUrl = options.server;

            console.log(chalk.cyan('Creating authenticationh token...'));
            console.log(chalk.gray('─'.repeat(50)));

            const axios = require('axios');

            // Step 1: Authenticate and get JWT token
            console.log(chalk.gray('Authenticating...'));
            const authResponse = await axios.post(
                `${serverUrl}/api/v1/auth/signin`,
                {
                    email: options.email,
                    password: options.password,
                },
                {
                    withCredentials: true,
                    timeout: 5000,
                },
            );

            if (!authResponse.data || !authResponse.headers['set-cookie']) {
                throw new Error('Authentication failed: No token received');
            }

            // Extract the session cookie from the authentication response
            const extractCookies = (setCookieHeader: string) => {
                const cookies = setCookieHeader
                    .split(';')
                    .map((cookie) => cookie.split(';')[0].trim());

                return cookies.join('; ');
            };

            const setCookieHeader = authResponse.headers['set-cookie'];
            const cookieString = Array.isArray(setCookieHeader)
                ? setCookieHeader.map((c) => c.split(';')[0]).join('; ')
                : extractCookies(setCookieHeader);

            // Step 2: Create token using the session
            console.log(chalk.gray('Creating token...'));
            const tokenResponse = await axios.post(
                `${serverUrl}/api/v1/tokens`,
                {
                    name: options.name,
                },
                {
                    headers: {
                        Cookie: cookieString,
                    },
                    withCredentials: true,
                    timeout: 5000,
                },
            );

            if (!tokenResponse.data || !tokenResponse.data.result) {
                throw new Error('Token creation failed: No token received');
            }

            const tokenId = tokenResponse.data.result.id;
            const token = tokenResponse.data.result.token;

            console.log(chalk.green('✓ Token created successfully\n'));
            console.log(chalk.cyan('Token Details:'));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.white(`ID:    ${tokenId}`));
            console.log(chalk.white(`Name:  ${options.name}`));
            console.log(chalk.yellow(`Token: ${token}\n`));
            console.log(
                chalk.bgYellow.black(' IMPORTANT: Save this token securely! '),
            );
            console.log(
                chalk.yellow('You will not be able to see it again.\n'),
            );
            console.log(chalk.gray('Use this token with:'));
            console.log(chalk.white(`  tunnel http <port> -t ${token}`));
            console.log(chalk.gray('Or set it as an environment variable:'));
            console.log(chalk.white(`  export TUNNEL_TOKEN=${token}\n`));
        } catch (error) {
            console.error(chalk.red('\n✗ Error creating token:'));
            if (error.response?.data?.message) {
                console.error(chalk.red(error.response.data.message));
            } else if (error.message) {
                console.error(chalk.red(error.message));
            } else {
                console.error(chalk.red('An unknown error occurred'));
            }
            process.exit(1);
        }
    });

program.parse();
