-- A shared feedback template for Not Satisfactory when the student didn't present (Assessment 2
-- is the performance evidence, shown in a presentation in class).

alter table public.feedback_templates drop constraint feedback_templates_outcome_check;
alter table public.feedback_templates add constraint feedback_templates_outcome_check
  check (outcome in ('satisfactory', 'reassessment', 'not_satisfactory_final', 'not_submitted', 'not_presented', 'other'));

insert into public.feedback_templates (name, outcome, body) values
('Not Satisfactory - Did not present', 'not_presented', $tpl$Hi {{student_first_name}},

Your assessment has been reviewed, and unfortunately, you have been marked as Not Satisfactory. You did not present your assessment in class following the unit requirements, which is a required component of the assessment criteria. Also I couldn't find any evidence of the practical part.

This also means that you are now “At Risk” of not meeting course progression.

These are your options:

Schedule your presentation with your trainer in class.

You may choose to undertake this term again and pay the full fee.

Accept that you will have a Not Yet Competent in your final transcript. Please note that having a Not Yet Competent in your academic history may impact on your ability to secure another visa in the future.

If this is not your first Not Yet Competent, you will receive an ‘Intention to Report’ letter from our team giving you further instructions on how to proceed.

What do I need to do next?

Contact the Student Support on students@laneway.edu.au to organise a meeting to discuss your options.

If we don’t hear from you in seven (7) days your final grade will be ‘Not Yet Competent’ for the term.

Please remember your obligations as an international student who is on a student visa:

You are enrolled as full-time student to attend a minimum of 20 scheduled course contact hours of classes per week;

During your enrolment, you signed an Acceptance of Offer and Student Enrolment Agreement that details your responsibility for maintaining satisfactory course progress;

You must participate in scheduled classes in accordance with course timetables to make satisfactory course progress; and

If you do not maintain satisfactory course progress, you are in breach of the conditions of your student visa. As a result of this, you may be reported to the Department of Home Affairs (DHA) for unsatisfactory course progress and your student visa may be cancelled

Refer to the Course Progress Policy and Procedure for further details.

Regards,

{{trainer_name}}$tpl$);
