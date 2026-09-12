SELECT setval(pg_get_serial_sequence('exec_project', 'id'),
              GREATEST((SELECT MAX(id) FROM exec_project), 15));
