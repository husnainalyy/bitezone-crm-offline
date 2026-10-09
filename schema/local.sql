-- BiteZone desktop database.
-- Column names match the online Supabase tables used to take an order.
-- Staff, inventory, recipes, payments, and reports stay in the online CRM.

create table if not exists restaurant_settings (
  id integer primary key check (id = 1),
  name text not null default 'BiteZone',
  phone text not null default '',
  address text not null default '',
  currency text not null default 'PKR',
  timezone text not null default 'Asia/Karachi',
  default_delivery_fee numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  daily_discount_percent numeric(5,2) not null default 0,
  daily_discount_date date,
  receipt_footer text not null default 'Thank you for choosing BiteZone.',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

insert into restaurant_settings (id) values (1) on conflict (id) do nothing;

create table if not exists categories (
  id uuid primary key,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists menu_items (
  id uuid primary key,
  category_id uuid not null references categories (id),
  name text not null,
  description text not null default '',
  price numeric(14,2) not null,
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  track_inventory boolean not null default false,
  version integer not null default 1
);

create table if not exists menu_item_variants (
  id uuid primary key,
  menu_item_id uuid not null references menu_items (id),
  name text not null,
  price numeric(14,2) not null,
  active boolean not null default true
);

create table if not exists restaurant_tables (
  id uuid primary key,
  name text not null,
  capacity integer not null default 4,
  active boolean not null default true,
  sort_order integer not null default 0,
  version integer not null default 1
);

create table if not exists customers (
  id uuid primary key,
  name text not null,
  phone text not null,
  alternate_phone text,
  notes text,
  version integer not null default 1,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed')),
  client_operation_id uuid unique,
  sync_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists customer_addresses (
  id uuid primary key,
  customer_id uuid not null references customers (id) on delete cascade,
  label text not null default 'Home',
  full_address text not null,
  area text not null default '',
  landmark text,
  instructions text,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'failed')),
  client_operation_id uuid unique,
  sync_payload jsonb,
  created_at timestamptz not null default now()
);

create sequence if not exists local_order_number_seq start 1;

create table if not exists orders (
  id uuid primary key,
  local_number integer not null default 0,
  order_number bigint unique,
  order_type text not null check (order_type in ('dine_in', 'takeaway', 'delivery')),
  order_source text not null check (order_source in ('admin', 'waiter', 'phone')),
  table_id uuid,
  customer_id uuid,
  status text not null default 'placed',
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  delivery_fee numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_status text not null default 'unpaid',
  paid_amount numeric(14,2) not null default 0,
  notes text,
  version integer not null default 1,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  client_operation_id uuid unique,
  payload jsonb,
  origin text not null default 'local' check (origin in ('local', 'server')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((order_type = 'dine_in' and table_id is not null) or (order_type <> 'dine_in' and table_id is null))
);

create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_open_table_idx on orders (table_id) where table_id is not null and status not in ('completed', 'cancelled');

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders (id) on delete cascade,
  menu_item_id uuid,
  variant_id uuid,
  item_name text not null,
  variant_name text,
  unit_price numeric(14,2) not null,
  quantity integer not null check (quantity between 1 and 999),
  line_total numeric(14,2) not null,
  notes text
);

create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists deliveries (
  id uuid primary key,
  order_id uuid not null unique references orders (id) on delete cascade,
  address_snapshot text not null,
  phone_snapshot text not null,
  area_snapshot text,
  landmark_snapshot text,
  instructions_snapshot text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists sync_state (
  id integer primary key check (id = 1),
  last_synced_at timestamptz,
  last_error text
);

insert into sync_state (id) values (1) on conflict (id) do nothing;
