import { parseArgs, promisify } from "node:util";
import type { ParseArgsConfig } from "node:util";
import { exec as childExec } from "node:child_process";

const exec = promisify(childExec);

const PARSE_ARGS_OPTS: ParseArgsConfig["options"] = {
	date: {
		type: "string",
		default: undefined,
	},
};

const COMMANDS = {
	GET_LAST_COMMIT: "git log -n 1 --format=fuller",
	UPDATE_DATE: (date: string) =>
		`git commit --amend --no-edit --date="${date}"`,
} as const;

const REGEX = {
	AUTHOR_DATE: new RegExp(/AuthorDate: (.*)\n/),
	COMMIT_HASH: new RegExp(/^commit ([a-zA-Z0-9]+)/),
} as const;

const getRegexValue = (regex: RegExp, string: string) =>
	regex.exec(string)?.[1];

const getUserDate = () => {
	const { values } = parseArgs({ options: PARSE_ARGS_OPTS });

	const date = values.date as string;

	if (!date) {
		console.error("Missing date!");
		return process.exit(1);
	}

	return date;
};

const execute = async (command: string, env: Record<string, string> = {}) => {
	const { stdout, stderr } = await exec(command, { env });

	if (stderr) {
		console.error(stderr);
		return process.exit(1);
	}

	return stdout;
};

const getAuthorDate = async () => {
	const output = await execute(COMMANDS.GET_LAST_COMMIT);

	if (output) {
		const authorDate = getRegexValue(REGEX.AUTHOR_DATE, output);

		if (authorDate) {
			return authorDate;
		}
	}

	console.error("Could not get author date");
	process.exit(1);
};

(async () => {
	const date = getUserDate();

	await execute(COMMANDS.UPDATE_DATE(date));

	const authorDate = await getAuthorDate();

	await execute(COMMANDS.UPDATE_DATE(authorDate), {
		GIT_COMMITTER_DATE: authorDate,
	});

	const output = await execute(COMMANDS.GET_LAST_COMMIT);

	if (output) {
		const authorDate = getRegexValue(REGEX.AUTHOR_DATE, output);
		const hash = getRegexValue(REGEX.COMMIT_HASH, output);

		console.log(`Successfully updated commit ${hash}`);
		console.log(`New commit date: ${authorDate}`);
	}
})();
