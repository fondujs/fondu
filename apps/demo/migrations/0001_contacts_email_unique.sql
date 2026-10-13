-- added by hand: the copies of an address entered before the index, which would stop it (the first one stays)
DELETE FROM `contacts` WHERE `id` NOT IN (SELECT min(`id`) FROM `contacts` GROUP BY `email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`);
