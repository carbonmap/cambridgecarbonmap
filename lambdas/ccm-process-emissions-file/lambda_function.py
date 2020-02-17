import json
import urllib.parse
import boto3
import re
import csv
from lib import pymysql
import os
import botocore
import datetime

#rds settings
rds_host  = os.environ['rds_host']
db_username = os.environ['db_username']
db_password = os.environ['db_password']
db_name = os.environ['db_name']

def read_json_file(filename):
    jsonFilename = os.environ['LAMBDA_TASK_ROOT'] + '/' + filename
    fileContents = open(jsonFilename).read()
    return json.loads(fileContents)

co2e_lookup = read_json_file('co2e.json')
config = read_json_file('config.json')

s3 = boto3.client('s3', config['AWS_REGION'], config=botocore.config.Config(s3={'addressing_style':'path'}))

def process_item(conn, reporting_entity, start, end, measure, unit, value):
    co2e = None
    calc = None
    start_datetime = datetime.datetime.fromisoformat(start)
    end_datetime = datetime.datetime.fromisoformat(end)
    for entry in co2e_lookup['co2eConversion']:
        lookup_start = datetime.datetime.fromisoformat(entry['periodStart'])
        lookup_end = datetime.datetime.fromisoformat(entry['periodEnd'])
        if (entry['measure'] == measure) and (entry['unit'] == unit) and (lookup_start <= start_datetime) and (lookup_end >= end_datetime):
            co2e = entry['factor'] * value
            calc = entry['id']
            break

    # No try-except - we'll just let it raise the exception
    with conn.cursor() as cur:
        #print('Inserting {}, {}, {}, {}, {}, {}'.format(reporting_entity, start, end, measure, unit, value))
        cur.execute('insert into readings (reporting_entity, period_start, period_end, measure, unit, value) \
            values (%s, %s, %s, %s, %s, %s) \
            on duplicate key update unit = %s, value = %s;', \
            (reporting_entity, start, end, measure, unit, value, unit, value))
        #print('Inserting {}, {}, {}, {}, {}, {}, {}, {}'.format(reporting_entity, start, end, measure, unit, value, co2e, calc))
        cur.execute('insert into emissions (reporting_entity, period_start, period_end, measure, unit, value, kgco2e, co2e_calculation) \
            values (%s, %s, %s, %s, %s, %s, %s, %s) \
            on duplicate key update unit = %s, value = %s, kgco2e = %s, co2e_calculation = %s;', \
            (reporting_entity, start, end, measure, unit, value, co2e, calc, unit, value, co2e, calc))

    conn.commit()

def write_entity_file(conn, reporting_entity):
    emissions = []
    with conn.cursor() as cur:
        cur.execute('select reporting_entity, period_start, period_end, measure, unit, value, kgco2e, co2e_calculation from emissions \
            where reporting_entity = %s\
            order by period_start;', (reporting_entity['id'],))
        rows = cur.fetchall()
        for row in rows:
            emissions.append({'periodStart':row[1].isoformat(), 'periodEnd':row[2].isoformat(), 'measure':row[3], 'unit':row[4], 'value':row[5], 'kgco2e': row[6], 'co2eCalculation':row[7]})
    reporting_entity['emissions'] = emissions
    j = json.dumps(reporting_entity)
    s3.put_object(Bucket=config['OUTPUT_BUCKET'], Key='reporting_entities/'+reporting_entity['id']+'.json', Body=j)

def update_entity_list(conn):
        with conn.cursor() as cur:
            cur.execute('select id from reporting_entities order by id')
            entity_list = []
            row = cur.fetchone()
            while row is not None:
                entity_list.append(row[0])
                row = cur.fetchone()

            j = json.dumps(entity_list)
            s3.put_object(Bucket=config['OUTPUT_BUCKET'], Key='reporting_entities/index.json', Body=j)  

def process_json(conn, data):
    if ('emissions' in data) and ('id' in data):
        reporting_entity = { 'id': data['id'] }
        with conn.cursor() as cur:
            cur.execute('select id, name, osm_entity, geojson from reporting_entities where id = %s', (data['id'],))
            rows = cur.fetchall()
            if len(rows) == 0:
                cur.execute('insert into reporting_entities (id) values(%s)', (data['id'],))
                conn.commit()
                update_entity_list(conn)
            else:
                reporting_entity = { 'id': rows[0][0], 'name': rows[0][1], 'osmEntity': rows[0][2], 'geojson': rows[0][3] }

        for item in data['emissions']:
            process_item(conn, data['id'], item['periodStart'], item['periodEnd'], item['measure'], item['unit'], item['value'])

        write_entity_file(conn, reporting_entity)

def lambda_handler(event, context):
    #print("Received event: " + json.dumps(event, indent=2))

    try:
        conn = pymysql.connect(rds_host, user=db_username, passwd=db_password, db=db_name, connect_timeout=5)
    except pymysql.MySQLError as e:
        print("ERROR: Unexpected error: Could not connect to MySQL instance '{}', db '{}' with user '{}'".format(rds_host, db_name, db_username))
        raise e

    #print('Connected to MySQL instance \'{}\', db \'{}\' with user \'{}\''.format(rds_host, db_name, db_username))

    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        regex = re.compile(r'\.\w+$')
        exts = regex.findall(key)

        if len(exts) > 0:
            if(exts[0] == '.json'):
                j = json.loads(obj['Body'].read())
                process_json(conn, j)
            elif (exts[0] == '.csv'):
                rows = csv.reader(obj['Body'].read().split('\n'), delimiter=',')
                process_csv(conn, rows)
            else:
                print('Unrecognised file format {}'.format(exts[0]))
                return False
        else:
            print('No extension on file {}'.format(key))

        return True
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
