#!/usr/bin/env node

import { parseArgs, promisify } from "node:util";
import { exec as childExec } from "node:child_process";
import { add, sub } from "date-fns";
import { z } from "zod";

const exec = promisify(childExec);

const COMMANDS = {
	GET_LAST_COMMIT: "git log -n 1 --format=fuller",
	UPDATE_DATE: (date: string) =>
		`git commit --amend --no-edit --date="${date}"`,
} as const;

const REGEX = {
	AUTHOR_DATE: new RegExp(/AuthorDate: (.*)\n/),
	COMMIT_HASH: new RegExp(/^commit ([a-zA-Z0-9]+)/),
	IN_X_TIME: new RegExp(/in (\d+) (second|minute|hour|day|week|month)s?/),
	X_TIME_AGO: new RegExp(/(\d+) (second|minute|hour|day|week|month)s?/),
} as const;

const AmountSchema = z.number({ coerce: true });
const TimeTypeSchema = z.enum([
	"second",
	"minute",
	"hour",
	"day",
	"week",
	"month",
]);

type TimeType = z.infer<typeof TimeTypeSchema>;

const getRegexValue = (regex: RegExp, string: string) =>
	regex.exec(string)?.[1];

const handleSpecificFormats = (input: string) => {
	const inTime = REGEX.IN_X_TIME.exec(input);
	const timeAgo = REGEX.X_TIME_AGO.exec(input);

	if (!inTime && !timeAgo) {
		return input;
	}

	const amountString = (inTime || timeAgo)[1];
	const timeTypeString = (inTime || timeAgo)[2];

	const { success: amountSuccess, data: amount } =
		AmountSchema.safeParse(amountString);
	const { success: timeTypeSuccess, data: timeType } =
		TimeTypeSchema.safeParse(timeTypeString);

	if (!amountSuccess || !timeTypeSuccess) {
		console.error("Invalid date string");
		process.exit(1);
	}

	const interval: `${TimeType}s` = `${timeType}s`;

	const modifyFn = inTime !== null ? add : sub;

	const newTime = modifyFn(new Date(), { [interval]: amount });

	return newTime.toLocaleString();
};

const getUserDate = () => {
	const { values } = parseArgs({
		options: {
			date: {
				type: "string",
				default: undefined,
			},
		},
	});

	if (!values.date) {
		console.error("Missing date!");
		return process.exit(1);
	}

	return handleSpecificFormats(values.date);
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
