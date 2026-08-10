import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type {
	IdentifierArray,
	IdentifierString,
	StandardConnectFeature,
	StandardConnectMethod,
	StandardDisconnectFeature,
	StandardDisconnectMethod,
	StandardEventsFeature,
	StandardEventsOnMethod,
	SuiFeatures,
	SuiSignAndExecuteTransactionMethod,
	SuiSignPersonalMessageMethod,
	SuiSignTransactionMethod,
	SuiSignTransactionBlockMethod,
	SuiSignAndExecuteTransactionBlockMethod,
} from '@mysten/wallet-standard';
import {
	getWallets,
	ReadonlyWalletAccount,
	StandardConnect,
	StandardDisconnect,
	StandardEvents,
	SuiSignAndExecuteTransaction,
	SuiSignPersonalMessage,
	SuiSignTransaction,
	SuiSignTransactionBlock,
	SuiSignAndExecuteTransactionBlock,
} from '@mysten/wallet-standard';
import type { Wallet } from '@mysten/wallet-standard';
import { toBase64 } from '@mysten/sui/utils';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { WalletInitializer } from '@mysten/dapp-kit-core';

const STORAGE_KEY = 'paystreamer_burner_sk';

function getChain(network: string): IdentifierString {
	const normalized = network === 'localnet' ? 'local' : network;
	return `sui:${normalized}` as IdentifierString;
}

function loadOrCreateKeypair(): Ed25519Keypair {
	const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
	if (stored) {
		try {
			return Ed25519Keypair.fromSecretKey(stored);
		} catch {
			// Fall through to create new
		}
	}
	const keypair = Ed25519Keypair.generate();
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, keypair.getSecretKey());
	}
	return keypair;
}

export function createPersistentBurnerWalletInitializer(): WalletInitializer {
	return {
		id: 'persistent-burner-initializer',
		initialize({ networks, getClient }) {
			try {
				const wallet = new PersistentBurnerWallet({ clients: networks.map((network) => getClient(network)) });
				const wallets = getWallets();
				const existing = typeof wallets?.get === 'function' ? wallets.get() : [];
				const isRegistered = existing.some((w) => w.name === wallet.name);
				if (!isRegistered) {
					const unregister = wallets.register(wallet);
					return { unregister: unregister || (() => {}) };
				}
				return { unregister: () => {} };
			} catch (err) {
				return { unregister: () => {} };
			}
		},
	};
}

class PersistentBurnerWallet implements Wallet {
	#chainConfig: Record<IdentifierString, ClientWithCoreApi>;
	#keypair: Ed25519Keypair;
	#account: ReadonlyWalletAccount;

	constructor({ clients }: { clients: ClientWithCoreApi[] }) {
		this.#chainConfig = clients.reduce<Record<IdentifierString, ClientWithCoreApi>>(
			(accumulator, client) => {
				const chain = getChain(client.network);
				accumulator[chain] = client;
				return accumulator;
			},
			{},
		);

		this.#keypair = loadOrCreateKeypair();

		this.#account = new ReadonlyWalletAccount({
			address: this.#keypair.getPublicKey().toSuiAddress(),
			publicKey: this.#keypair.getPublicKey().toSuiBytes(),
			chains: this.chains,
			features: [
				SuiSignTransaction, 
				SuiSignAndExecuteTransaction, 
				SuiSignPersonalMessage,
				SuiSignTransactionBlock,
				SuiSignAndExecuteTransactionBlock
			],
		});
	}

	get version() {
		return '1.0.0' as const;
	}

	get name() {
		return 'Persistent Burner Wallet' as const;
	}

	get icon() {
		return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' as const;
	}

	get chains() {
		return Object.keys(this.#chainConfig) as IdentifierArray;
	}

	get accounts() {
		return [this.#account];
	}

	get features(): StandardConnectFeature & StandardDisconnectFeature & StandardEventsFeature & SuiFeatures {
		return {
			[StandardConnect]: {
				version: '1.0.0',
				connect: this.#connect,
			},
			[StandardDisconnect]: {
				version: '1.0.0',
				disconnect: this.#disconnect,
			},
			[StandardEvents]: {
				version: '1.0.0',
				on: this.#on,
			},
			[SuiSignPersonalMessage]: {
				version: '1.1.0',
				signPersonalMessage: this.#signPersonalMessage,
			},
			[SuiSignTransaction]: {
				version: '2.0.0',
				signTransaction: this.#signTransaction,
			},
			[SuiSignAndExecuteTransaction]: {
				version: '2.0.0',
				signAndExecuteTransaction: this.#signAndExecuteTransaction,
			},
			[SuiSignTransactionBlock]: {
				version: '1.0.0',
				signTransactionBlock: this.#signTransactionBlock,
			},
			[SuiSignAndExecuteTransactionBlock]: {
				version: '1.0.0',
				signAndExecuteTransactionBlock: this.#signAndExecuteTransactionBlock,
			},
		};
	}

	#on: StandardEventsOnMethod = () => {
		return () => {};
	};

	#connect: StandardConnectMethod = async () => {
		return { accounts: this.accounts };
	};

	#disconnect: StandardDisconnectMethod = async () => {
		// Nothing to actually clean up for a burner wallet
	};

	#signPersonalMessage: SuiSignPersonalMessageMethod = async (messageInput) => {
		return await this.#keypair.signPersonalMessage(messageInput.message);
	};

	#signTransaction: SuiSignTransactionMethod = async ({ transaction, signal, chain }) => {
		signal?.throwIfAborted();

		const client = this.#chainConfig[chain];
		if (!client) throw new Error(`Invalid chain "${chain}" specified.`);

		const parsedTransaction = Transaction.from(await transaction.toJSON());
		const builtTransaction = await parsedTransaction.build({ client });
		return await this.#keypair.signTransaction(builtTransaction);
	};

	#signAndExecuteTransaction: SuiSignAndExecuteTransactionMethod = async ({
		transaction,
		signal,
		chain,
	}) => {
		signal?.throwIfAborted();

		const client = this.#chainConfig[chain];
		if (!client) throw new Error(`Invalid chain "${chain}" specified.`);

		const parsedTransaction = Transaction.from(await transaction.toJSON());
		const bytes = await parsedTransaction.build({ client });

		const result = await this.#keypair.signAndExecuteTransaction({
			transaction: parsedTransaction,
			client,
		});

		const tx = result.Transaction ?? result.FailedTransaction;
		return {
			bytes: toBase64(bytes),
			signature: tx.signatures[0],
			digest: tx.digest,
			effects: toBase64(tx.effects.bcs!),
		};
	};

	#signTransactionBlock: SuiSignTransactionBlockMethod = async ({ transactionBlock, chain }) => {
		const result = await this.#signTransaction({ transaction: transactionBlock as any, chain } as any);
		return {
			transactionBlockBytes: result.bytes,
			signature: result.signature,
		};
	};

	#signAndExecuteTransactionBlock: SuiSignAndExecuteTransactionBlockMethod = async ({
		transactionBlock,
		chain,
		account,
	}) => {
		const result = await this.#signAndExecuteTransaction({
			transaction: transactionBlock as any,
			chain,
			account
		} as any);

		return result as any;
	};
}
