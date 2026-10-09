# Intentionally empty.
#
# `app` owns integrations and shared plumbing (public_id, sms, fcm, uploads,
# responses) and no domain models. Every model lives in the feature app that
# owns its endpoints — user, teacher, school, vacancy, application, cms,
# notifications. See CLAUDE.md §2.
#
# The file stays so Django registers the app normally. Do not delete it.
