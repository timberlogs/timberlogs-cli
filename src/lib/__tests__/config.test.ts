import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {readConfig, writeConfig, deleteConfig, getConfigDir, getConfigPath} from '../config.js';
import {mkdtempSync, rmSync, existsSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

describe('config', () => {
	let tmpDir: string;
	const originalEnv = process.env;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'timberlogs-test-'));
		process.env = {...originalEnv, TIMBERLOGS_CONFIG_DIR: tmpDir};
	});

	afterEach(() => {
		process.env = originalEnv;
		rmSync(tmpDir, {recursive: true, force: true});
	});

	describe('getConfigDir', () => {
		it('returns env var when set', () => {
			expect(getConfigDir()).toBe(tmpDir);
		});

		it('returns default when env not set', () => {
			delete process.env['TIMBERLOGS_CONFIG_DIR'];
			const dir = getConfigDir();
			expect(dir).toContain(join('.config', 'timberlogs'));
		});
	});

	describe('getConfigPath', () => {
		it('returns config.json in config dir', () => {
			expect(getConfigPath()).toBe(join(tmpDir, 'config.json'));
		});
	});

	describe('readConfig', () => {
		it('returns empty object when no config file', () => {
			expect(readConfig()).toEqual({});
		});

		it('reads existing config', () => {
			writeConfig({sessionToken: 'tl_sess_test'});
			expect(readConfig()).toEqual({sessionToken: 'tl_sess_test'});
		});
	});

	describe('writeConfig', () => {
		it('creates config file', () => {
			writeConfig({sessionToken: 'tl_sess_test'});
			const path = getConfigPath();
			expect(existsSync(path)).toBe(true);
			const content = JSON.parse(readFileSync(path, 'utf-8'));
			expect(content).toEqual({sessionToken: 'tl_sess_test'});
		});

		it.skipIf(process.platform === 'win32')('sets secure file permissions', () => {
			writeConfig({sessionToken: 'tl_sess_test'});
			const path = getConfigPath();
			const stats = statSync(path);
			expect(stats.mode & 0o777).toBe(0o600);
		});
	});

	describe('deleteConfig', () => {
		it('deletes existing config file', () => {
			writeConfig({sessionToken: 'tl_sess_test'});
			const path = getConfigPath();
			expect(existsSync(path)).toBe(true);
			deleteConfig();
			expect(existsSync(path)).toBe(false);
		});

		it('does not throw when no config file', () => {
			expect(() => deleteConfig()).not.toThrow();
		});
	});
});
