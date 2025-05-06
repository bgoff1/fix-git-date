#!/usr/bin/env node

import { parseArgs, promisify } from "node:util";
import { exec as childExec } from "node:child_process";
import {
	addHours,
	addDays,
	addMilliseconds,
	addMinutes,
	addMonths,
	addSeconds,
	addWeeks,
} from "date-fns";
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
	IN_X_TIME: new RegExp(/in (\d+) (hour|day)s?/),
} as const;

const getRegexValue = (regex: RegExp, string: string) =>
	regex.exec(string)?.[1];

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

	const inTime = REGEX.IN_X_TIME.exec(values.date);

	if (inTime) {
		const amount = z.number({ coerce: true }).safeParse(inTime[1]);
		const TimeTypeSchema = z.enum([
			"millisecond",
			"second",
			"minute",
			"hour",
			"day",
			"week",
			"month",
		]);
		const timeType = TimeTypeSchema.safeParse(inTime[2]);

		if (!amount.success || !timeType.success) {
			console.error("Invalid date string");
			process.exit(1);
		}

		const addFns: Record<
			z.infer<typeof TimeTypeSchema>,
			(date: Date, amount: number) => Date
		> = {
			millisecond: addMilliseconds,
			second: addSeconds,
			minute: addMinutes,
			hour: addHours,
			day: addDays,
			week: addWeeks,
			month: addMonths,
		};

		return addFns[timeType.data](new Date(), amount.data).toLocaleString();
	}

	return values.date;
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
