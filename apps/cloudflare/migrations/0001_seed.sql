-- Demo data. The two accounts (passwords hashed by Better Auth's own `hashPassword`):
--   demo@fondu.dev / fondu-demo     role user
--   admin@fondu.dev / fondu-admin   role admin
-- A real app creates accounts by signing up and never ships one.
INSERT INTO `contacts` (`name`, `email`) VALUES ('Ada Lovelace', 'ada@example.com'), ('Alan Turing', 'alan@example.com'), ('Grace Hopper', 'grace@example.com');
--> statement-breakpoint
INSERT INTO `users` (`id`, `name`, `email`, `email_verified`, `role`, `created_at`, `updated_at`) VALUES
  ('demo-user', 'Demo User', 'demo@fondu.dev', 1, 'user', 1791763200000, 1791763200000),
  ('demo-admin', 'Demo Admin', 'admin@fondu.dev', 1, 'admin', 1791763200000, 1791763200000);
--> statement-breakpoint
INSERT INTO `accounts` (`id`, `account_id`, `provider_id`, `user_id`, `password`, `created_at`, `updated_at`) VALUES
  ('demo-user-credential', 'demo-user', 'credential', 'demo-user', 'f43bf09b651c6511cdb620361c010e57:e7de6c079f2c162f1a781ba999c5b6e4a3ad85c736afcbcde00cc92862ab322f47483a7db6b3cec04733a8e70f03f123bc0450df18743342d4b2e44a8aebfaf2', 1791763200000, 1791763200000),
  ('demo-admin-credential', 'demo-admin', 'credential', 'demo-admin', '677007e6d94a4df7a350a819575c0a19:8d870ca91e360151e484e54b22a3c197ab200ef8ea4f16cb711414cf2ade24453e3096459769c8bd17b70a163287b9fc665a6b6859228cd92a55f7e26d63b3f5', 1791763200000, 1791763200000);
