-- Feedback templates trainers start assessment feedback from, and a cache of each unit's
-- knowledge and performance evidence from training.gov.au (used to list the criteria met).
--
-- Templates use {{placeholders}} filled in for the student and unit, and [square brackets] for
-- the parts the trainer writes. Shared templates (no owner) are managed by admins; trainers can
-- also keep their own.

create table public.feedback_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null constraint feedback_templates_name_check check (btrim(name) <> ''),
  -- Which result the template is suggested for.
  outcome text not null default 'other' constraint feedback_templates_outcome_check
    check (outcome in ('satisfactory', 'reassessment', 'not_satisfactory_final', 'not_submitted', 'other')),
  body text not null constraint feedback_templates_body_check check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_templates_owner_idx on public.feedback_templates (owner_id);

create trigger feedback_templates_touch
  before update on public.feedback_templates
  for each row execute function public.touch_updated_at();

alter table public.feedback_templates enable row level security;

create policy "signed in only" on public.feedback_templates as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);
create policy "feedback templates: staff read shared and own" on public.feedback_templates for select to laneway_app
  using (public.is_admin() or (public.is_staff() and (owner_id is null or owner_id = app.user_id())));
create policy "feedback templates: own or admin write" on public.feedback_templates for all to laneway_app
  using (public.is_admin() or (public.is_staff() and owner_id = app.user_id()))
  with check (public.is_admin() or (public.is_staff() and owner_id = app.user_id()));

grant select, insert, update, delete on public.feedback_templates to laneway_app;

-- Evidence lists from a unit's current release on training.gov.au, refreshed when stale.
create table public.unit_evidence (
  code text primary key,
  title text not null,
  release text not null,
  knowledge jsonb not null default '[]',
  performance jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

alter table public.unit_evidence enable row level security;

create policy "signed in only" on public.unit_evidence as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);
create policy "unit evidence: staff" on public.unit_evidence for all to laneway_app
  using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.unit_evidence to laneway_app;

-- Laneway's standard templates.
insert into public.feedback_templates (name, outcome, body) values
('Satisfactory', 'satisfactory', $tpl$Hi {{student_first_name}},

{{assessor_intro}}

Congratulations, your assessment has been marked Satisfactory.

Task 1 - Satisfactory. [Positive feedback on task 1]

Task 2 - Satisfactory. [Positive feedback on task 2]

{{criteria}}

Please contact your trainer if you have any questions.

Regards,

{{trainer_name}}$tpl$),

('Reassessment', 'reassessment', $tpl$Hi {{student_first_name}},

{{assessor_intro}}

Your assessment has been marked as a “Reassessment” because the submitted work does not meet the assessment criteria.

Please address the following:

Resubmit [Task 2]

Task 1 - Satisfactory. [Positive feedback, and the criteria met according to the mapping document]

Task 2 - Resubmit. [Constructive feedback about what needs to be improved, and the criteria met / not met according to the mapping document]

Instructions to re-submit your assessment:

Save your submission file with a different filename by adding a version number at the end of the filename (i.e. version 2 or v2)

Select “Add a new attempt” button

You have seven (7) days to resubmit the assessment task(s) outlined as “Reassessment” as explained above.

What happens if I do not submit my reassessment task(s) by the deadline?

Your assessment task(s) will be marked as “Not Satisfactory” and the unit(s) of competency you enrolled in the term will be deemed as “Not Yet Competent”;

You will receive a Warning Letter for failing to maintain satisfactory course progress OR notice of intention to cancel your enrolment due to unsatisfactory course progress if you failed more than 50% of the term.

*Please note that to avoid being issued with a warning and potential cancellation of your enrolment, it is your obligation as an international student who is on a student visa to successfully complete the course that you are enrolled in.

If you need any help and/or have questions about your assessment, please contact your trainer for support.

Regards,

{{trainer_name}}$tpl$),

('Not Satisfactory - After second attempt', 'not_satisfactory_final', $tpl$Dear {{student_first_name}},

Your second reassessment was reviewed and you have been marked Not Satisfactory. This was your last attempt to complete this assessment. Your progress for this term has therefore been deemed Not Yet Competent.

This also means that you are now “At Risk” of not meeting course progression.

These are your options:

You may choose to undertake this term again and pay the full fee.

Accept that you will have a Not Yet Competent in your final transcript. Please note that having a Not Yet Competent in your academic history may impact on your ability to secure another visa in the future.

If this is not your first Not Yet Competent, you will receive an ‘Intention to Report’ letter from our team giving you further instructions on how to proceed.

What do I need to do next?

Contact the Academic Team on academic@laneway.edu.au to organise a meeting to discuss your options.

If we don’t hear from you in seven (7) days your final grade will be ‘Not Yet Competent’ for the term.

Please remember your obligations as an international student who is on a student visa:

You are enrolled as full-time student to attend a minimum of 20 scheduled course contact hours of classes per week;

During your enrolment, you signed an Acceptance of Offer and Student Enrolment Agreement that details your responsibility for maintaining satisfactory course progress;

You must participate in scheduled classes in accordance with course timetables to make satisfactory course progress; and

If you do not maintain satisfactory course progress, you are in breach of the conditions of your student visa. As a result of this, you may be reported to the Department of Home Affairs (DHA) for unsatisfactory course progress and your student visa may be cancelled

Refer to the Course Progress Policy and Procedure for further details.

Regards,

{{trainer_name}}$tpl$),

('Not Satisfactory - No submission', 'not_submitted', $tpl$Dear {{student_first_name}},

You didn't submit your assessment and you have been marked Not Satisfactory. Your progress for this term has therefore been deemed Not Yet Competent.

This also means that you are now “At Risk” of not meeting course progression.

These are your options:

You may choose to undertake this term again and pay the full fee.

Accept that you will have a Not Yet Competent in your final transcript. Please note that having a Not Yet Competent in your academic history may impact on your ability to secure another visa in the future.

If this is not your first Not Yet Competent, you will receive an ‘Intention to Report’ letter from our team giving you further instructions on how to proceed.

What do I need to do next?

Contact your trainer to discuss your options.

If we don’t hear from you in seven (7) days your final grade will be ‘Not Yet Competent’ for the term.

Please remember your obligations as an international student who is on a student visa:

You are enrolled as full-time student to attend a minimum of 20 scheduled course contact hours of classes per week;

During your enrolment, you signed an Acceptance of Offer and Student Enrolment Agreement that details your responsibility for maintaining satisfactory course progress;

You must participate in scheduled classes in accordance with course timetables to make satisfactory course progress; and

If you do not maintain satisfactory course progress, you are in breach of the conditions of your student visa. As a result of this, you may be reported to the Department of Home Affairs (DHA) for unsatisfactory course progress and your student visa may be cancelled

Refer to the Course Progress Policy and Procedure for further details.

Regards,

{{trainer_name}}$tpl$);
