# Normalization (1NF to 3NF)

## Starting point: one flat "booking sheet" (UNF)

| booking_id | user_name | user_email | role | dept | resource | building | room | capacity | equipment_list | status | approved_by | start | end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Aarav Sharma | aarav@.. | student | CSE | DSA Lab | Engineering | E-201 | 60 | "Projector, PC set" | approved | Neha Kapoor | ... | ... |

Problems: repeating group (`equipment_list`), user and resource details repeated on every booking, updating a resource's capacity means editing many rows, and deleting the last booking of a user loses the user.

## 1NF: atomic values, no repeating groups

* `equipment_list` becomes rows in a junction table `booking_equipment (booking_id, equipment_id, quantity)`.
* Every column holds one value; every table has a primary key.

## 2NF: no partial dependency on part of a composite key

In `booking_equipment` the key is `(booking_id, equipment_id)`. Only `quantity` is stored, and it depends on the whole key. Equipment name, tag and stock live in `equipment` (depends on `equipment_id` alone). Likewise booking facts stay in `bookings`.

## 3NF: no transitive dependency (non-key column depending on another non-key column)

| Transitive dependency in the flat sheet | Resolved by |
|---|---|
| user_id -> role -> role description | `users.role_id` references `roles` |
| user_id -> department -> department name/code | `users.department_id` references `departments` |
| resource_id -> room -> building -> building name | `resources.room_id` -> `rooms.building_id` -> `buildings` |
| resource_id -> category -> kind | `resources.category_id` references `resource_categories` |
| booking_id -> approved_by -> admin name | `booking_approvals.admin_id` references `users` |

## Final design check

| Table | Key | Determinants | In 3NF? |
|---|---|---|---|
| roles | id | name (unique candidate key) | yes |
| departments | id | code, name (candidate keys) | yes |
| buildings / rooms | id | (building_id, room_number) unique | yes |
| users | id | email, member_id candidate keys; role and department stored as FKs | yes |
| resources | id | code candidate key; room, category, department as FKs | yes |
| equipment | id | asset_tag candidate key | yes |
| bookings | id | booking_code candidate key; only booking facts | yes |
| booking_equipment | (booking_id, equipment_id) | quantity depends on both | yes |
| booking_approvals | id | booking_id unique (one decision per booking) | yes |
| notifications | id | content plus optional links | yes |

## Deliberate, documented denormalization

| What | Why it is acceptable |
|---|---|
| `booking_status_history.old_status/new_status` store status text instead of an FK | an append-only audit record must not change if a lookup value is renamed |
| `notifications.title/message` store rendered text | a notification is a historical message, not derived data |
| `bookings.cancelled_at/cancel_reason` on the booking | a single optional fact of one booking, no separate entity |
| MongoDB `booking_audit.snapshot` holds a copy of the booking | audit data must survive later edits and deletions |

Derived values (hours, utilization, approval rate) are computed by functions, views and queries, never stored, which avoids update anomalies.
