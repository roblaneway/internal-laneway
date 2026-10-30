-- Laneway Education portal — demo seed data.
-- Every person here is fictional. All accounts share the password: LanewayDemo2026!
-- Dates are relative to the day the seed runs (Melbourne time), so the demo
-- always has a "this week" and a "next week" roster.

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
-- Courses and classes
-- ---------------------------------------------------------------------------
insert into public.courses (id, code, name) values
  ('d0000000-0000-4000-8000-000000000001', 'ICT50220-COD', 'Diploma of Information Technology (Coding)'),
  ('d0000000-0000-4000-8000-000000000002', 'ICT60220-COD', 'Advanced Diploma of Information Technology (Coding)'),
  ('d0000000-0000-4000-8000-000000000003', 'ICT50220-CYB', 'Diploma of Information Technology (Cyber Security)');

-- Roster weeks: Monday of the current Melbourne week, or next Monday on a weekend.
create temp table seed_dates as
select
  case when extract(isodow from today) >= 6
       then date_trunc('week', today)::date + 7
       else date_trunc('week', today)::date end as wk1
from (select (now() at time zone 'Australia/Melbourne')::date as today) t;

-- Term started five weeks before roster week 1, so roster week 1 = term week 6.
insert into public.classes (id, course_id, name, room, delivery_mode, term, start_date, trainer_id)
select v.id::uuid, v.course_id::uuid, v.name, v.room, v.mode::public.delivery_mode,
       'Term 4 ' || extract(year from d.wk1), d.wk1 - 35, v.trainer::uuid
from seed_dates d,
(values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'DIT Coding — Group A',      'Melbourne CBD · Level 4, Room 4.02', 'on-campus', 'b0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'DIT Coding — Evening',      'Online · Zoom',                      'online',    'b0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'ADIT Coding — Group A',     'Melbourne CBD · Level 5, Room 5.01', 'on-campus', 'b0000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002', 'ADIT Coding — Online',      'Online · Zoom',                      'online',    'b0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000003', 'DIT Cyber — Group A',       'Melbourne CBD · Level 3, Cyber Lab', 'on-campus', 'b0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000003', 'DIT Cyber — Evening',       'Online · Zoom',                      'online',    'b0000000-0000-4000-8000-000000000005')
) as v(id, course_id, name, room, mode, trainer);

-- Students 1–7 → class 1, 8–14 → class 2, ... (the last class gets the remainder).
insert into public.class_enrolments (class_id, student_id)
select ('e0000000-0000-4000-8000-' || lpad(least(6, ((i - 1) / 7) + 1)::text, 12, '0'))::uuid,
       ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 40) i;

-- ---------------------------------------------------------------------------
-- Roster: two weeks, each class meets twice a week
-- ---------------------------------------------------------------------------
insert into public.roster_shifts (trainer_id, class_id, date, start_time, end_time)
select c.trainer_id, c.id, d.wk1 + w * 7 + s.dow, s.start_t::time, s.end_t::time
from seed_dates d
cross join generate_series(0, 1) w
join (values
  ('e0000000-0000-4000-8000-000000000001', 0, '09:00', '13:00'),
  ('e0000000-0000-4000-8000-000000000001', 2, '09:00', '13:00'),
  ('e0000000-0000-4000-8000-000000000002', 1, '18:00', '21:00'),
  ('e0000000-0000-4000-8000-000000000002', 3, '18:00', '21:00'),
  ('e0000000-0000-4000-8000-000000000003', 0, '13:30', '17:30'),
  ('e0000000-0000-4000-8000-000000000003', 3, '13:30', '17:30'),
  ('e0000000-0000-4000-8000-000000000004', 1, '09:00', '13:00'),
  ('e0000000-0000-4000-8000-000000000004', 4, '09:00', '13:00'),
  ('e0000000-0000-4000-8000-000000000005', 2, '13:30', '17:30'),
  ('e0000000-0000-4000-8000-000000000005', 4, '13:30', '17:30'),
  ('e0000000-0000-4000-8000-000000000006', 0, '18:00', '21:00'),
  ('e0000000-0000-4000-8000-000000000006', 2, '18:00', '21:00')
) as s(class_id, dow, start_t, end_t) on true
join public.classes c on c.id = s.class_id::uuid;

-- Two shifts needing cover (no cover trainer assigned yet).
update public.roster_shifts set needs_cover = true, notes = 'Trainer on personal leave'
where class_id = 'e0000000-0000-4000-8000-000000000002' and date = (select wk1 + 3 from seed_dates);
update public.roster_shifts set needs_cover = true, notes = 'Trainer attending industry conference'
where class_id = 'e0000000-0000-4000-8000-000000000005' and date = (select wk1 + 11 from seed_dates);

-- One shift already covered, one cancelled.
update public.roster_shifts set cover_trainer_id = 'b0000000-0000-4000-8000-000000000002', notes = 'Covered by Aiko'
where class_id = 'e0000000-0000-4000-8000-000000000006' and date = (select wk1 + 7 from seed_dates);
update public.roster_shifts set status = 'cancelled', notes = 'Campus event — session moved online next week'
where class_id = 'e0000000-0000-4000-8000-000000000004' and date = (select wk1 + 11 from seed_dates);

-- One overlapping conflict, as if imported from the old roster spreadsheet:
-- Marcus is double-booked on Monday morning. The overlap trigger is bypassed
-- here only so the portal can demonstrate conflict detection.
alter table public.roster_shifts disable trigger roster_shifts_no_overlap;
insert into public.roster_shifts (trainer_id, class_id, date, start_time, end_time, notes)
select 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', wk1, '11:00', '15:00',
       'Imported from legacy roster — React workshop'
from seed_dates;
alter table public.roster_shifts enable trigger roster_shifts_no_overlap;

-- ---------------------------------------------------------------------------
-- Content plans (10 weeks) for three classes
-- ---------------------------------------------------------------------------
-- Weeks 1–5 are delivered and later weeks are drafts. Everything up to and
-- including "next week" is ready, except the DIT Cyber class, whose next week is
-- still a draft so the admin dashboard has something to chase. "Next week" is
-- term week 7 when seeded on a weekday, or 6 on a weekend (roster week 1 then
-- starts next Monday).
create temp table seed_plans (class_no int, week int, unit text, topic text, outcomes text, url text, assessment boolean);
insert into seed_plans values
  -- DIT Coding — Group A
  (1, 1,  'ICTPRG430', 'Programming fundamentals with JavaScript',   'Use variables, types, control flow and functions; set up VS Code and Node.js', 'https://developer.mozilla.org/en-US/docs/Learn/JavaScript', false),
  (1, 2,  'ICTPRG430', 'Objects, arrays and modern ES syntax',        'Apply destructuring, spread, array methods and modules',                      'https://javascript.info/', false),
  (1, 3,  'ICTWEB513', 'Semantic HTML and responsive CSS',            'Build an accessible, mobile-first page with Flexbox and Grid',                'https://web.dev/learn/css', false),
  (1, 4,  'ICTWEB513', 'Assessment 1: static portfolio site',          'Deliver a responsive portfolio site that passes an accessibility audit',     'https://web.dev/learn/accessibility', true),
  (1, 5,  'ICTPRG434', 'Introduction to React',                        'Build components with JSX, props and state',                                  'https://react.dev/learn', false),
  (1, 6,  'ICTPRG434', 'React hooks and data fetching',                'Use useEffect, custom hooks and handle loading and error states',             'https://react.dev/reference/react/hooks', false),
  (1, 7,  'ICTPRG435', 'Node.js and the npm ecosystem',                'Write CLI scripts, manage packages and use environment variables',            'https://nodejs.org/en/learn', false),
  (1, 8,  'ICTPRG435', 'Assessment 2: React to-do app',                'Deliver a React app with routing, forms and local persistence',               'https://react.dev/learn/managing-state', true),
  (1, 9,  'ICTPRG554', 'REST APIs with Express and PostgreSQL',       'Design routes and status codes, and query a relational database from Node.js', 'https://expressjs.com/', false),
  (1, 10, 'ICTSAS527', 'Assessment 3: full-stack project showcase',    'Present a deployed full-stack app and reflect on the build process',          'https://docs.github.com/en/pages', true),
  -- ADIT Coding — Group A
  (3, 1,  'ICTPRG549', 'TypeScript for application developers',       'Apply static types, generics and strict compiler settings',                   'https://www.typescriptlang.org/docs/', false),
  (3, 2,  'ICTPRG549', 'API design principles',                        'Design RESTful resources and document them with OpenAPI',                     'https://swagger.io/specification/', false),
  (3, 3,  'ICTPRG553', 'Authentication and authorisation',             'Implement JWT sessions, OAuth flows and role-based access',                   'https://oauth.net/2/', false),
  (3, 4,  'ICTPRG553', 'Assessment 1: secured REST API',               'Deliver a documented REST API with auth, validation and tests',               'https://owasp.org/API-Security/', true),
  (3, 5,  'ICTPRG554', 'NoSQL data stores',                            'Model documents and choose between relational and NoSQL stores',              'https://www.mongodb.com/docs/manual/', false),
  (3, 6,  'ICTCLD401', 'Cloud fundamentals on AWS',                    'Explain regions, IAM, shared responsibility and the free tier',               'https://aws.amazon.com/getting-started/', false),
  (3, 7,  'ICTCLD401', 'Deploying Node.js to AWS',                     'Containerise an API and deploy it to AWS App Runner',                          'https://docs.aws.amazon.com/apprunner/', false),
  (3, 8,  'ICTCLD502', 'Assessment 2: cloud deployment',               'Deploy a production-ready API with CI/CD and monitoring on AWS',              'https://docs.github.com/en/actions', true),
  (3, 9,  'ICTICT517', 'Secure coding and observability',             'Remediate OWASP Top 10 risks, add structured logging and set alerts',          'https://owasp.org/www-project-top-ten/', false),
  (3, 10, 'ICTPMG613', 'Assessment 3: capstone presentation',          'Present a team capstone to an industry panel',                                 'https://www.atlassian.com/agile', true),
  -- DIT Cyber — Group A
  (5, 1,  'ICTCYS407', 'The threat landscape',                         'Describe common threat actors, attack vectors and the Essential Eight',        'https://www.cyber.gov.au/resources-business-and-government/essential-cyber-security/essential-eight', false),
  (5, 2,  'ICTPRG302', 'Python for security scripting',                'Write Python scripts to parse logs and automate checks',                       'https://docs.python.org/3/tutorial/', false),
  (5, 3,  'ICTPRG302', 'Python networking with sockets and Scapy',     'Capture and analyse packets programmatically',                                 'https://scapy.readthedocs.io/', false),
  (5, 4,  'ICTCYS407', 'Assessment 1: threat report',                  'Gather and interpret threat data for a fictional SME',                         'https://attack.mitre.org/', true),
  (5, 5,  'ICTNWK546', 'Network defence fundamentals',                 'Design segmented networks with firewalls and VLANs',                           'https://www.cisco.com/c/en/us/products/security/firewalls/what-is-a-firewall.html', false),
  (5, 6,  'ICTNWK546', 'Intrusion detection with Suricata',            'Deploy IDS rules and triage alerts',                                           'https://docs.suricata.io/', false),
  (5, 7,  'ICTCYS403', 'Secure coding for web applications',           'Find and fix injection, XSS and broken access control',                        'https://owasp.org/www-project-top-ten/', false),
  (5, 8,  'ICTCYS403', 'Assessment 2: secure code review',             'Audit a vulnerable app and report remediations',                               'https://owasp.org/www-project-web-security-testing-guide/', true),
  (5, 9,  'ICTCYS406', 'Identity, cloud security and incident response', 'Apply MFA and least privilege, harden AWS, and run an incident tabletop',   'https://www.cyber.gov.au/report-and-recover', false),
  (5, 10, 'ICTCYS406', 'Assessment 3: capture the flag',               'Complete a team CTF covering web, network and forensics challenges',           'https://picoctf.org/', true);

insert into public.content_plans
  (class_id, week_number, unit_code, topic, learning_outcomes, resources_url, assessment_due, status)
select ('e0000000-0000-4000-8000-' || lpad(p.class_no::text, 12, '0'))::uuid,
       p.week, p.unit, p.topic, p.outcomes, p.url, p.assessment,
       (case
          when p.week <= 5 then 'delivered'
          when p.week < n.next_week then 'ready'
          when p.week = n.next_week and p.class_no <> 5 then 'ready'
          else 'draft'
        end)::public.plan_status
from seed_plans p,
     (select case when extract(isodow from (now() at time zone 'Australia/Melbourne')::date) >= 6
                  then 6 else 7 end as next_week) n;

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
  ('Assessment 2 due in week 8',
   '<p>A reminder that <strong>Assessment 2</strong> is due at the end of week 8. Submit through the learning platform before 11:59 pm Friday.</p><p>Extensions must be requested before the due date with supporting documentation.</p>',
   'course', 'd0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', false, 2),
  ('Cyber Security CTF night',
   '<p>Put your skills to the test at our end-of-term <em>Capture the Flag</em> practice night. Teams of three, pizza provided.</p>',
   'course', 'd0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', false, 9),
  ('Bring your laptop with Node.js 22 installed',
   '<p>Next week we start Node.js. Please install the <strong>Node.js 22 LTS</strong> release before class and run <code>node --version</code> to check.</p>',
   'class', 'e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', false, 1),
  ('New Zoom link for evening classes',
   '<p>From this week the evening class uses a new Zoom meeting. The link is on your class page. The old link will stop working.</p>',
   'class', 'e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', false, 12),
  ('Student wellbeing and support services',
   '<p>Studying in a new country can be challenging. Our student support team offers free, confidential appointments for wellbeing, accommodation and study skills. Book at reception or online.</p>',
   'all', null, 'a0000000-0000-4000-8000-000000000001', false, 20)
) as v(title, body, audience, target, author, pinned, days_ago);

-- Notifications from older announcements are mostly read already.
update public.notifications n set read_at = n.created_at + interval '1 day'
where n.title not like '%Campus closure%'
  and n.title not like '%Node.js 22%'
  and n.title not like '%Assessment 2%';

-- Back-date notifications to match their announcement.
update public.notifications n set created_at = a.published_at, read_at = case when n.read_at is null then null else a.published_at + interval '1 day' end
from public.announcements a
where n.link = '/announcements/' || a.id;
