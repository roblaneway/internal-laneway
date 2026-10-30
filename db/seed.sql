-- Laneway Education portal — demo seed data.
-- Every person here is fictional. All accounts share the password: LanewayDemo2026!
-- Classes, rosters and content plans follow the Term 4 2026 IT class planning
-- sheet (22/09–27/11/2026). Announcement dates are relative to the day the seed runs.

-- ---------------------------------------------------------------------------
-- Demo users
-- ---------------------------------------------------------------------------
create temp table demo_password as
select extensions.crypt('LanewayDemo2026!', extensions.gen_salt('bf', 8)) as hash;

create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_name text, p_role public.user_role)
returns void
language sql
as $$
  insert into public.profiles (id, email, full_name, role) values (p_id, p_email, p_name, p_role);
  insert into app.credentials (user_id, password_hash) select p_id, hash from demo_password;
$$;

-- Admin and trainers (fixed ids so the rest of the seed can reference them)
select pg_temp.demo_user('a0000000-0000-4000-8000-000000000001', 'admin@example.com',    'Grace Holloway',   'admin');
select pg_temp.demo_user('b0000000-0000-4000-8000-000000000001', 'trainer@example.com',  'Marcus Webb',      'trainer');
select pg_temp.demo_user('b0000000-0000-4000-8000-000000000002', 'aiko.tanaka@example.com',      'Aiko Tanaka',      'trainer');
select pg_temp.demo_user('b0000000-0000-4000-8000-000000000003', 'sofia.marchetti@example.com',  'Sofia Marchetti',  'trainer');
select pg_temp.demo_user('b0000000-0000-4000-8000-000000000004', 'daniel.okafor@example.com',    'Daniel Okafor',    'trainer');
select pg_temp.demo_user('b0000000-0000-4000-8000-000000000005', 'hannah.lindqvist@example.com', 'Hannah Lindqvist', 'trainer');

-- 40 students. The first is the demo student login.
do $$
declare
  v_names text[] := array[
    'Lucas Pereira', 'Mei Lin Zhou', 'Arjun Mehta', 'Camila Rojas', 'Thanh Nguyen',
    'Sakura Ito', 'Mateo Fernández', 'Ji-woo Park', 'Aisha Rahman', 'Gabriel Costa',
    'Ananya Iyer', 'Diego Morales', 'Nok Srisai', 'Yuki Hayashi', 'Rafael Almeida',
    'Priyanka Desai', 'Kenji Watanabe', 'Valentina Ruiz', 'Hiroshi Kato', 'Isabela Santos',
    'Minh Anh Tran', 'Sebastián Herrera', 'Seo-yeon Kim', 'Farhan Hossain', 'Beatriz Lima',
    'Rohan Kapoor', 'Daniela Vargas', 'Kanya Wongsuwan', 'Takumi Mori', 'Juliana Rocha',
    'Nikhil Joshi', 'Lucía Castillo', 'Duc Pham', 'Haruka Saito', 'Thiago Barbosa',
    'Meera Pillai', 'Andrés Navarro', 'Min-jun Choi', 'Nadia Karim', 'Felipe Duarte'
  ];
  v_email text;
  i int;
begin
  for i in 1 .. array_length(v_names, 1) loop
    if i = 1 then
      v_email := 'student@example.com';
    else
      v_email := lower(
        translate(replace(v_names[i], ' ', '.'), 'áéíóúñãçÁÉÍÓÚ-', 'aeiounacAEIOU')
      ) || '@example.com';
    end if;
    perform pg_temp.demo_user(
      ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, v_email, v_names[i], 'student'
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Courses and classes: Term 4 2026 IT classes (from "Class Planning IT - 2026 - Melbourne")
-- ---------------------------------------------------------------------------
-- The planning sheet names the qualifications but not their codes, so the codes are
-- national qualification codes plus a stream suffix.
insert into public.courses (id, code, name) values
  ('d0000000-0000-4000-8000-000000000001', 'ICT50220-WEBF', 'Diploma of IT (Web) — Foundation'),
  ('d0000000-0000-4000-8000-000000000002', 'ICT50220-CYB',  'Diploma of ICT — Cyber Security'),
  ('d0000000-0000-4000-8000-000000000003', 'ICT50220-WEB',  'Diploma of ICT — Web Development'),
  ('d0000000-0000-4000-8000-000000000004', 'ICT60220-TEL',  'Advanced Diploma of Information Technology (Telecom)');

-- Week 1 starts Monday 21/09/2026; each class meets one day a week. The sheet has
-- no trainers, so each class has a demo lead trainer (reassign in the portal).
insert into public.classes (id, course_id, name, room, delivery_mode, term, start_date, trainer_id) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Web Foundation — Tuesday',     'Melbourne CBD · Level 4, Room 4.02', 'on-campus', 'Term 4 2026', '2026-09-21', 'b0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Cyber Security — Wednesday',   'Melbourne CBD · Level 3, Cyber Lab', 'on-campus', 'Term 4 2026', '2026-09-21', 'b0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Web Development — Thursday',   'Melbourne CBD · Level 4, Room 4.02', 'on-campus', 'Term 4 2026', '2026-09-21', 'b0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'Adv Diploma Telecom — Friday', 'Melbourne CBD · Level 5, Room 5.01', 'on-campus', 'Term 4 2026', '2026-09-21', 'b0000000-0000-4000-8000-000000000003');

-- Students 1–10 → class 1, 11–20 → class 2, and so on.
insert into public.class_enrolments (class_id, student_id)
select ('e0000000-0000-4000-8000-' || lpad((((i - 1) / 10) + 1)::text, 12, '0'))::uuid,
       ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 40) i;

-- ---------------------------------------------------------------------------
-- Roster: one 9:00–15:00 session per class each week of term
-- ---------------------------------------------------------------------------
-- Class days: Tuesday, Wednesday, Thursday and Friday (days after the week's Monday).
-- The sheet's public holidays (Fri 25/09 and Tue 03/11) stay on the roster as cancelled.
insert into public.roster_shifts (trainer_id, class_id, date, start_time, end_time, status, notes)
select c.trainer_id, c.id, d.date, '09:00', '15:00',
       (case when d.date in ('2026-09-25', '2026-11-03') then 'cancelled' else 'scheduled' end)::public.shift_status,
       case when d.date in ('2026-09-25', '2026-11-03') then 'Public holiday: no class' end
from public.classes c
join (values
  ('e0000000-0000-4000-8000-000000000001', 1),
  ('e0000000-0000-4000-8000-000000000002', 2),
  ('e0000000-0000-4000-8000-000000000003', 3),
  ('e0000000-0000-4000-8000-000000000004', 4)
) as s(class_id, day_offset) on s.class_id::uuid = c.id
cross join generate_series(0, 9) w
cross join lateral (select c.start_date + w * 7 + s.day_offset as date) d;

-- ---------------------------------------------------------------------------
-- Content plans (10 weeks) for every class, from the planning sheet
-- ---------------------------------------------------------------------------
-- Weeks before the current term week are delivered. Later weeks are ready when the
-- sheet has content for them, and drafts (hidden from students) when it doesn't.
create temp table seed_plans (class_no int, week int, unit text, topic text, outcomes text, assessment boolean, has_content boolean);
insert into seed_plans values
  -- Web Foundation — Tuesday
  (1,  1, 'ICTWEB519', 'Introduction + How the internet works + HTML (Intro) · Assessment 1', 'ICTWEB519 Develop complex web page layouts', true, true),
  (1,  2, 'ICTWEB519', 'HTML · Assessment 3', 'ICTWEB519 Develop complex web page layouts', true, true),
  (1,  3, 'ICTWEB519', 'Basic CSS', 'ICTWEB519 Develop complex web page layouts', false, true),
  (1,  4, 'ICTWEB519', 'Intermediate CSS', 'ICTWEB519 Develop complex web page layouts', false, true),
  (1,  5, 'ICTWEB519', 'Intermediate CSS - Part 2 · Intro - Bootstrap Part 1', 'ICTWEB519 Develop complex web page layouts', false, true),
  (1,  6, 'ICTWEB520', 'Bootstrap - Part 2 · Assessment 2 Project', 'ICTWEB520 Develop complex cascading style sheets', true, true),
  (1,  7, 'ICTWEB520', 'Public Holiday', 'Public holiday: no class', false, true),
  (1,  8, 'ICTWEB520', 'Javascript', 'ICTWEB520 Develop complex cascading style sheets', false, true),
  (1,  9, 'ICTWEB520', 'Javascript - Part 2', 'ICTWEB520 Develop complex cascading style sheets', false, true),
  (1, 10, 'ICTWEB520', 'Final Presentation', 'ICTWEB520 Develop complex cascading style sheets', true, true),
  -- Cyber Security — Wednesday
  (2,  1, 'BSBXCS402', 'Introduction to cyber security best practises · Social Engineering · Assessment 1', 'BSBXCS402 Promote workplace cyber security awareness and best practices', true, true),
  (2,  2, 'BSBXCS402', 'OpenAI Breach · AI in Cyber Security · Prompt Airline · Promoting Workplace · Types of attacks', 'BSBXCS402 Promote workplace cyber security awareness and best practices', false, true),
  (2,  3, 'BSBXCS402', 'Safety Training · Enterprise Security Concepts · Data Sovereignty · Data Protection · Geographical Considerations · Cyber Security Awareness Training · Assessment 2 - Task 2', 'BSBXCS402 Promote workplace cyber security awareness and best practices', true, true),
  (2,  4, 'BSBXCS402', 'Social Engineering · How to Present · Phishing Test · Finish - Assessment 2', 'BSBXCS402 Promote workplace cyber security awareness and best practices', true, true),
  (2,  5, 'BSBXCS402', 'Presentations', 'BSBXCS402 Promote workplace cyber security awareness and best practices', false, true),
  (2,  6, 'ICTSAD508', 'Develop technical requirements for business solutions · Business Models and solutions · Assessment 3', 'ICTSAD508 Develop technical requirements for business solutions', true, true),
  (2,  7, 'ICTSAD508', '', 'ICTSAD508 Develop technical requirements for business solutions', false, false),
  (2,  8, 'ICTSAD508', '', 'ICTSAD508 Develop technical requirements for business solutions', false, false),
  (2,  9, 'ICTSAD508', '', 'ICTSAD508 Develop technical requirements for business solutions', false, false),
  (2, 10, 'ICTSAD508', '', 'ICTSAD508 Develop technical requirements for business solutions', false, false),
  -- Web Development — Thursday
  (3,  1, 'ICTICT530', 'Introduction to the term · User Experience · Persona · Customer Journey · Lab - 0 · Assessment 1', 'ICTICT530 Design user experience solutions', true, true),
  (3,  2, 'ICTICT530', 'Brief · Task Flow · Wireframe · Start project - Assessment 2', 'ICTICT530 Design user experience solutions', false, true),
  (3,  3, 'ICTICT530', 'Mockup as a prototype · UI mockup · Webpage mockup · Typography · Colours · High Fidelity Wireframe · Assessment 2', 'ICTICT530 Design user experience solutions', true, true),
  (3,  4, 'ICTICT530', 'Human Experience · Presentation / Assessment 2', 'ICTICT530 Design user experience solutions', true, true),
  (3,  5, 'ICTWEB522', 'Website Information Architecture · Site hierarchy · Site map · Assessment 3', 'ICTWEB522 Develop website information architecture', true, true),
  (3,  6, 'ICTWEB522', 'Navigation system · Testing · Assessment 4', 'ICTWEB522 Develop website information architecture', true, true),
  (3,  7, 'ICTWEB518', 'XML - Part 1', 'ICTWEB518 Build a document using extensible markup language', false, true),
  (3,  8, 'ICTWEB518', 'XML - Part 2 · Assessment 5', 'ICTWEB518 Build a document using extensible markup language', true, true),
  (3,  9, 'ICTWEB518', 'XML - Part 3 · JSON · Assessment 6', 'ICTWEB518 Build a document using extensible markup language', true, true),
  (3, 10, 'ICTWEB518', 'Extra ??', 'ICTWEB518 Build a document using extensible markup language', false, false),
  -- Adv Diploma Telecom — Friday
  (4,  1, null, 'Public Holiday', 'Public holiday: no class', false, true),
  (4,  2, 'BSBCRT611', 'Creative Thinking · Divergent Thinking · Critical Thinking · Covergent Thinking · Lateral Thinking · Design Thinking · Assessment 1', 'BSBCRT611 Apply critical thinking for complex problem solving', true, true),
  (4,  3, 'BSBCRT611', 'Ideate / Making Connections · UVP · Prototype · Test · Reflection · Assessment Project', 'BSBCRT611 Apply critical thinking for complex problem solving', true, true),
  (4,  4, 'BSBCRT611', 'Presentation · Final Test · Reflections · Finish Assessment', 'BSBCRT611 Apply critical thinking for complex problem solving', true, true),
  (4,  5, 'BSBLDR601', 'Change Management · Developing a change management strategy · Change Management Plan · Assessment 3', 'BSBLDR601 Lead and manage organisational change', true, true),
  (4,  6, 'BSBLDR601', 'Implementing the Strategy · Cost-Benefit Analysis · Reporting Protocols · Organisational behaviour · Managing Risks · Communicating', 'BSBLDR601 Lead and manage organisational change', false, true),
  (4,  7, 'BSBLDR601', 'Presentation', 'BSBLDR601 Lead and manage organisational change', false, true),
  (4,  8, 'BSBSTR601', '', 'BSBSTR601 Manage innovation and continuous improvement', false, false),
  (4,  9, 'BSBSTR601', '', 'BSBSTR601 Manage innovation and continuous improvement', false, false),
  (4, 10, 'BSBSTR601', '', 'BSBSTR601 Manage innovation and continuous improvement', false, false);

insert into public.content_plans
  (class_id, week_number, unit_code, topic, learning_outcomes, assessment_due, status)
select c.id, p.week, p.unit, p.topic, p.outcomes, p.assessment,
       (case
          when p.week < n.current_week then 'delivered'
          when p.has_content then 'ready'
          else 'draft'
        end)::public.plan_status
from seed_plans p
join public.classes c on c.id = ('e0000000-0000-4000-8000-' || lpad(p.class_no::text, 12, '0'))::uuid
cross join lateral (
  select ((now() at time zone 'Australia/Melbourne')::date - c.start_date) / 7 + 1 as current_week
) n;

-- ---------------------------------------------------------------------------
-- Invoice details for the demo trainer login (fictional ABN and bank account)
-- ---------------------------------------------------------------------------
insert into public.trainer_billing
  (trainer_id, hourly_rate, abn, gst_registered, address, phone, bank_account_name, bank_bsb, bank_account_number)
values
  ('b0000000-0000-4000-8000-000000000001', 65.00, '12345678901', false, '1 Example Lane, Melbourne VIC 3000', '0400 000 000',
   'Marcus Webb', '123456', '12345678');

-- ---------------------------------------------------------------------------
-- Announcements (the trigger creates student notifications for each)
-- ---------------------------------------------------------------------------
insert into public.announcements (title, body, audience, target_id, author_id, pinned, published_at)
select v.title, v.body, v.audience::public.announcement_audience, v.target::uuid, v.author::uuid, v.pinned,
       now() - (v.days_ago || ' days')::interval
from (values
  ('Term 4 timetable is now available',
   '<p>Welcome to Term 4! Your class timetable is available under <strong>My timetable</strong>. Please check your session times and rooms each week, as rooms can change.</p><ul><li>On-campus classes run at our Melbourne CBD campus.</li><li>Online classes use the Zoom link shown on your class page.</li></ul>',
   'all', null, 'a0000000-0000-4000-8000-000000000001', true, 34),
  ('Campus closure: building maintenance',
   '<p>The Melbourne CBD campus will be <strong>closed this coming Saturday and Sunday</strong> for electrical maintenance. Weekday classes are not affected.</p><p>Student support remains available online during the closure.</p>',
   'all', null, 'a0000000-0000-4000-8000-000000000001', true, 3),
  ('Careers workshop: landing your first IT role in Australia',
   '<p>Join our careers team for a hands-on workshop covering résumés for the Australian market, LinkedIn profiles and technical interview practice.</p><p><strong>When:</strong> Thursday 5:00 pm – 6:30 pm<br><strong>Where:</strong> Level 2 common room and online</p>',
   'all', null, 'a0000000-0000-4000-8000-000000000001', false, 6),
  ('Assessment 5 due in week 8',
   '<p>A reminder that <strong>Assessment 5</strong> (XML, unit ICTWEB518) is due at the end of week 8. Submit through the learning platform before 11:59 pm Friday.</p><p>Extensions must be requested before the due date with supporting documentation.</p>',
   'course', 'd0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', false, 2),
  ('Cyber Security awareness: phishing test results',
   '<p>Thanks to everyone who took part in the week 4 phishing test. We will go through the results and the warning signs you missed at the start of next class.</p>',
   'course', 'd0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', false, 9),
  ('Bring your laptop with VS Code installed',
   '<p>JavaScript starts in week 8. Please install <strong>VS Code</strong> and the <strong>Node.js 22 LTS</strong> release before class and run <code>node --version</code> to check.</p>',
   'class', 'e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', false, 1),
  ('New unit from week 6: ICTSAD508',
   '<p>From week 6 we move on to <strong>ICTSAD508 Develop technical requirements for business solutions</strong>. The unit outline and Assessment 3 brief are on your class page.</p>',
   'class', 'e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', false, 4),
  ('Student wellbeing and support services',
   '<p>Studying in a new country can be challenging. Our student support team offers free, confidential appointments for wellbeing, accommodation and study skills. Book at reception or online.</p>',
   'all', null, 'a0000000-0000-4000-8000-000000000001', false, 20)
) as v(title, body, audience, target, author, pinned, days_ago);

-- Notifications from older announcements are mostly read already.
update public.notifications n set read_at = n.created_at + interval '1 day'
where n.title not like '%Campus closure%'
  and n.title not like '%VS Code%'
  and n.title not like '%Assessment 5%';

-- Back-date notifications to match their announcement.
update public.notifications n set created_at = a.published_at, read_at = case when n.read_at is null then null else a.published_at + interval '1 day' end
from public.announcements a
where n.link = '/announcements/' || a.id;
